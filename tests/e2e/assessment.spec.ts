import { test, expect } from "@playwright/test";
import { answerIntro } from "./intro";

test("adaptive assessment: difficulty, comparisons, confidence stop and applied display", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const login = await request.post("http://127.0.0.1:8000/api/login", {
    data: { username: "admin", password: "manutailor-demo" },
  });
  const admin = await login.json();
  const headers = { Authorization: "Bearer " + admin.token };
  const bank = await (
    await request.get("http://127.0.0.1:8000/api/admin/question-bank", {
      headers,
    })
  ).json();
  const username = "assessment-e2e-" + Date.now();
  await request.post("http://127.0.0.1:8000/api/users", {
    headers,
    data: { name: "表示チェックE2E", username, password: "assessment-demo" },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByLabel("ユーザー名", { exact: true }).fill(username);
  await page.getByLabel("パスワード", { exact: true }).fill("assessment-demo");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByRole("link", { name: "表示の好みをチェック" }).click();
  const started = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/assessments") && r.request().method() === "POST",
  );
  await answerIntro(page, [2, 1, 0, 1, 1, 1, 0]);
  let state = await (await started).json();
  const questions: string[] = [];
  while (state.question) {
    const q = state.question;
    questions.push(q.id);
    expect(q.correct_answer).toBeUndefined();
    const anchor = bank.find((b: { id: string }) => b.id === q.id);
    const wrong = ["kanji-hard", "visual-text", "density-long"].includes(q.id);
    const next = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/assessments/${state.id}/answers`) &&
        r.request().method() === "POST",
    );
    if (q.question_type === "sequence") {
      for (const i of anchor.correct_answer)
        await page
          .getByRole("button", { name: anchor.choices[i], exact: true })
          .click();
      await page.getByRole("button", { name: "この順序で進む" }).click();
    } else {
      const text = anchor
        ? anchor.choices[
            wrong
              ? (anchor.correct_answer + 1) % anchor.choices.length
              : anchor.correct_answer
          ]
        : q.prompt.match(/『(.+?)を選ぶ/)[1];
      await page.getByRole("button", { name: text, exact: true }).click();
    }
    state = await (await next).json();
  }
  expect(questions.indexOf("kanji-mid")).toBeGreaterThan(
    questions.indexOf("kanji-basic"),
  );
  expect(questions.indexOf("kanji-hard")).toBeGreaterThan(
    questions.indexOf("kanji-mid"),
  );
  expect(questions.indexOf("kanji-ruby")).toBeGreaterThan(
    questions.indexOf("kanji-hard"),
  );
  expect(state.result.profile.use_furigana).toBe(true);
  expect(state.result.profile.visual_support).toBeGreaterThanOrEqual(0.7);
  expect(state.result.profile.max_sentence_chars).toBe(28);
  await expect(
    page.getByRole("heading", { name: "あなたに合いそうな表示" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/assessment-result-390.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "この設定で使う" }).click();
  await expect(page).toHaveURL("/app/profile");
  await expect(
    page.getByLabel("ふりがな（対応する業務用語）", { exact: true }),
  ).toBeChecked();
  const users = await (
    await request.get("http://127.0.0.1:8000/api/users", { headers })
  ).json();
  const user = users.find((u: { username: string }) => u.username === username);
  const debug = await (
    await request.get(
      `http://127.0.0.1:8000/api/admin/assessments/${user.id}`,
      { headers },
    )
  ).json();
  expect(debug.sessions[0].result.performance.visual.gain).toBeGreaterThan(0);
  expect(debug.sessions[0].result.performance.short.gain).toBeGreaterThan(0);
  // Start again with correct responses to exercise confidence-based early completion.
  await page.goto("/app/profile/test");
  const second = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/assessments") && r.request().method() === "POST",
  );
  await answerIntro(page, [2, 0, 1, 1, 1, 1, 0]);
  let correctState = await (await second).json();
  while (correctState.question) {
    const q = correctState.question;
    if (q.id === "density-long") await page.waitForTimeout(1200);
    if (q.id === "density-short") await page.waitForTimeout(650);
    const anchor = bank.find((b: { id: string }) => b.id === q.id);
    const next = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/assessments/${correctState.id}/answers`) &&
        r.request().method() === "POST",
    );
    if (q.question_type === "sequence") {
      for (const i of anchor.correct_answer)
        await page
          .getByRole("button", { name: anchor.choices[i], exact: true })
          .click();
      await page.getByRole("button", { name: "この順序で進む" }).click();
    } else {
      const text = anchor
        ? anchor.choices[anchor.correct_answer]
        : q.prompt.match(/『(.+?)を選ぶ/)[1];
      await page.getByRole("button", { name: text, exact: true }).click();
    }
    correctState = await (await next).json();
  }
  const updated = await (
    await request.get(
      `http://127.0.0.1:8000/api/admin/assessments/${user.id}`,
      { headers },
    )
  ).json();
  expect(updated.sessions[0].stop_reason).toBe("confidence_reached");
  expect(
    updated.sessions[0].result.performance.short.time_gain,
  ).toBeGreaterThan(0);
  expect(correctState.answered).toBeLessThan(24);
  // Admin drilldown contains the recorded question-selection reasons.
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await page.getByLabel("ユーザー名", { exact: true }).fill("admin");
  await page.getByLabel("パスワード", { exact: true }).fill("manutailor-demo");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL("/admin");
  await page.goto(`/admin/users/${user.id}/assessment`);
  await expect(
    page.getByRole("heading", { name: "表示チェックの記録" }),
  ).toBeVisible();
  await expect(page.locator("table").first()).toContainText("漢字表記");
  await page.screenshot({
    path: "test-results/assessment-debug-390.png",
    fullPage: true,
  });
});
