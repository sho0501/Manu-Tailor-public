import { test, expect } from "@playwright/test";
import { answerIntro } from "./intro";

test("a reader who does not know Japanese can start and skip an English trial", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("button", { name: "English" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByLabel("Username").fill("demo");
  await page.getByLabel("Password").fill("manutailor-demo");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/app");
  await page.goto("/app/profile/test");
  await expect(
    page.getByRole("heading", { name: "We find a display that suits you" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "How well can you read Japanese?" }),
  ).toHaveCount(0);
  await expect(page.getByText("Japanese usage frequency")).toHaveCount(0);
  const started = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/assessments") && r.request().method() === "POST",
  );
  await answerIntro(page, [0, 1, 1, 1, 0]);
  const session = await (await started).json();
  expect(session.question.language).toBe("en");
  await expect(
    page.getByRole("heading", { name: session.question.prompt }),
  ).toBeVisible();
  const skipped = page.waitForResponse((r) =>
    r.url().endsWith(`/assessments/${session.id}/answers`),
  );
  await page.getByRole("button", { name: "Can’t read / Skip" }).click();
  expect((await skipped).status()).toBe(200);
});

test("easy Japanese trial is readable without kanji", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "にほんご（やさしい）" }).click();
  await page.getByLabel("ゆーざーめい").fill("demo");
  await page.getByLabel("ぱすわーど").fill("manutailor-demo");
  await page.getByRole("button", { name: "ろぐいん" }).click();
  await page.waitForURL("**/app");
  await page.goto("/app/profile/test");
  await expect(
    page.getByRole("heading", { name: "にほんごはどのくらいよめますか？" }),
  ).toHaveCount(0);
  const started = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/assessments") && r.request().method() === "POST",
  );
  await answerIntro(page, [0, 1, 1, 1, 0]);
  const session = await (await started).json();
  expect(session.question.language).toBe("ja-easy");
  expect(
    /[一-龯]/.test(session.question.prompt + session.question.choices.join("")),
  ).toBe(false);
});

test("the first Japanese reading choice uses kana and switches to easy Japanese", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("ユーザー名").fill("demo");
  await page.getByLabel("パスワード").fill("manutailor-demo");
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForURL("**/app");
  await page.goto("/app/profile/test");
  const gate = page.locator(".preference-test");
  await expect(
    gate.getByRole("heading", { name: "にほんごは どのくらい よめますか？" }),
  ).toBeVisible();
  const choiceText = await gate.locator(".choice-grid").innerText();
  expect(/[一-龯]/.test(choiceText)).toBe(false);
  await gate
    .getByRole("button", {
      name: "ひらがなは よめます。かんじは むずかしいです",
    })
    .click();
  await expect(
    page.getByRole("button", { name: "にほんご（やさしい）" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    gate.getByRole("heading", {
      name: "どちらのぶんしょうがよみやすいですか？",
    }),
  ).toBeVisible();
  const started = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/assessments") && r.request().method() === "POST",
  );
  await answerIntro(page, [0, 1, 1, 1, 0]);
  const session = await (await started).json();
  expect(session.question.language).toBe("ja-easy");
});

test("a person who cannot read Japanese can choose a language by its own name", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  await page.getByLabel("ユーザー名").fill("demo");
  await page.getByLabel("パスワード").fill("manutailor-demo");
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForURL("**/app");
  await page.goto("/app/profile/test");
  await page
    .getByRole("button", { name: "にほんごは まだ よめません" })
    .click();
  await expect(
    page.getByRole("heading", { name: /Choose a language/ }),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Choose a language" })
    .getByRole("button", { name: "English" })
    .click();
  await expect(page.getByRole("button", { name: "English" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("heading", { name: "Which text is easier to read?" }),
  ).toBeVisible();
});
