import { test, expect } from "@playwright/test";
import { answerIntro } from "./intro";
import { openManualCard } from "./manuals";

test("detailed check exercises memory delay, sequence cards and every domain", async ({
  page,
  request,
}) => {
  const login = await (
    await request.post("http://127.0.0.1:8000/api/login", {
      data: { username: "admin", password: "manutailor-demo" },
    })
  ).json();
  const headers = { Authorization: "Bearer " + login.token };
  const bank = await (
    await request.get("http://127.0.0.1:8000/api/admin/question-bank", {
      headers,
    })
  ).json();
  await page.goto("/login");
  await page.getByLabel("ユーザー名", { exact: true }).fill("detail");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL("/app");
  await page.goto("/app/profile/test");
  const start = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/assessments") && r.request().method() === "POST",
  );
  await answerIntro(page, [2, 0, 1, 1, 1, 1, 1]);
  let state = await (await start).json();
  const ids: string[] = [];
  while (state.question) {
    const q = state.question;
    ids.push(q.id);
    const canonical = bank.find((x: { id: string }) => x.id === q.id);
    if (q.memory_seconds) {
      await expect(
        page.locator(".preference-test").getByRole("status"),
      ).toContainText("数秒後");
      await expect(page.locator(".choice")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: q.recall })).toBeVisible({
        timeout: 7000,
      });
      await expect(page.getByRole("heading", { name: q.prompt })).toHaveCount(
        0,
      );
    }
    const next = page.waitForResponse((r) =>
      r.url().endsWith(`/assessments/${state.id}/answers`),
    );
    if (q.question_type === "sequence") {
      for (const i of canonical.correct_answer)
        await page
          .getByRole("button", { name: canonical.choices[i], exact: true })
          .click();
      await expect(
        page.getByRole("list", { name: "選んだ順序" }).locator("li"),
      ).toHaveCount(3);
      await page.getByRole("button", { name: "この順序で進む" }).click();
    } else {
      const text = canonical
        ? canonical.choices[canonical.correct_answer]
        : q.prompt.match(/『(.+?)を選ぶ/)[1];
      await page.getByRole("button", { name: text, exact: true }).click();
    }
    state = await (await next).json();
  }
  expect(ids).toEqual(
    expect.arrayContaining([
      "memory-plain",
      "memory-split",
      "sequence",
      "sequence-before",
      "condition",
      "number",
      "unit",
      "time",
      "warning-highlight",
    ]),
  );
  await expect(
    page.getByRole("heading", { name: "あなたに合いそうな表示" }),
  ).toBeVisible();
});

test("simulated A and B profiles render different pagination and furigana", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("ユーザー名", { exact: true }).fill("assessment-b");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await openManualCard(page);
  await expect(page.locator(".instruction")).toHaveCount(3);
  await expect(page.locator("ruby")).toHaveCount(0);
  await page.getByRole("button", { name: "次へ", exact: true }).click();
  await expect(page.locator(".step-progress strong")).toContainText("4 /");
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await page.getByLabel("ユーザー名", { exact: true }).fill("assessment-a");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await openManualCard(page);
  await expect(page.locator(".instruction")).toHaveCount(1);
  await expect(page.locator("ruby").first()).toBeVisible();
});
