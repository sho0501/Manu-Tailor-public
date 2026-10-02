import { test, expect, type Page } from "@playwright/test";
import { answerIntro } from "./intro";
import { openManualCard } from "./manuals";
async function login(page: Page, user = "demo") {
  await page.goto("/login");
  await page.getByLabel("ユーザー名", { exact: true }).fill(user);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(
    page.getByText(
      user === "admin"
        ? "わかりやすい手順を、現場へ。"
        : "青木さん、こんにちは。",
      { exact: true },
    ),
  ).toBeVisible();
}
test("publication -> Service Worker notice -> task -> source; preferences and offline", async ({
  browser,
}) => {
  const workerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "ja-JP",
  });
  const worker = await workerContext.newPage();
  await login(worker);
  await worker.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  await worker.evaluate(() => {
    (window as any).notificationReceived = false;
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "MANU_NOTIFICATION")
        (window as any).notificationReceived = true;
    });
  });
  const adminContext = await browser.newContext({ locale: "ja-JP" });
  const admin = await adminContext.newPage();
  await login(admin, "admin");
  await admin
    .getByRole("link", { name: "マニュアルを登録", exact: true })
    .click();
  const title = "E2E コピー作業 " + Date.now();
  await admin.getByLabel("マニュアルの名前").fill(title);
  await admin
    .getByLabel("または原文を入力")
    .fill(
      "1. 原稿をセットしてください。\n2. 部数を1部に設定してください。\n3. 「スタート」ボタンを押してください。\n注意：動作中は電源を切らないでください。",
    );
  await admin.getByRole("button", { name: "登録して内容を確認" }).click();
  await admin.getByLabel("届ける利用者").selectOption({ label: "青木 はる" });
  await admin.getByRole("button", { name: "個別変換と検品を開始" }).click();
  const review = admin
    .locator(".card")
    .filter({ has: admin.getByRole("heading", { name: title, exact: true }) });
  await review.getByRole("button", { name: "原文と比較" }).click();
  await expect(admin.getByRole("dialog")).toContainText(
    "原稿をセットしてください。",
  );
  await admin.getByRole("button", { name: "閉じる", exact: true }).click();
  await review.getByRole("button", { name: "承認する" }).click();
  await review.getByRole("button", { name: "公開する" }).click();
  await expect(review.getByText("公開済み", { exact: true })).toBeVisible();
  await expect
    .poll(() => worker.evaluate(() => (window as any).notificationReceived), {
      timeout: 15000,
    })
    .toBe(true);
  await worker.goto("/app/notifications");
  await worker.locator(".notice").first().click();
  await expect(
    worker.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await worker.getByRole("button", { name: "原文を確認", exact: true }).click();
  await expect(worker.getByRole("dialog")).toContainText(
    "原稿をセットしてください。",
  );
  await worker.getByRole("button", { name: "閉じる", exact: true }).click();
  const next = worker.getByRole("button", { name: "次へ", exact: true });
  if (await next.count()) {
    await next.click();
    await expect(worker.locator(".instruction")).toContainText("1部");
    await worker.getByRole("button", { name: "戻る", exact: true }).click();
  } else {
    await expect(worker.getByRole("button", { name: "完了する", exact: true })).toBeVisible();
  }
  await expect(worker.locator(".instruction")).toContainText("原稿");
  await worker.screenshot({
    path: "test-results/manual-390.png",
    fullPage: true,
  });
  await workerContext.setOffline(true);
  await worker.reload();
  await expect(
    worker.getByText(
      "このマニュアルは最新版ではない可能性があります。保存済みの原文を表示しています。",
    ),
  ).toBeVisible();
  await worker.getByRole("button", { name: "原文を確認", exact: true }).click();
  await expect(worker.getByRole("dialog")).toContainText("原稿をセット");
  await worker.getByRole("button", { name: "閉じる", exact: true }).click();
  await workerContext.setOffline(false);
  await worker.goto("/app/profile/test");
  await answerIntro(worker, [2, 0, 1, 1, 1, 1, 0]);
  await worker.locator(".choice").first().click();
  await worker.getByRole("button", { name: "ここまでで表示を提案" }).click();
  await worker.getByRole("button", { name: "この設定で使う" }).click();
  await expect(
    worker.getByRole("heading", { name: "あなたに合う表示に" }),
  ).toBeVisible();
  await worker.getByLabel("文字の大きさ").selectOption("1.2");
  await worker.getByRole("button", { name: "設定を保存", exact: true }).click();
  await expect(
    worker.getByText(
      "設定を保存しました。次の個別生成から文章の設定が反映されます。",
    ),
  ).toBeVisible();
  await workerContext.close();
  await adminContext.close();
});
for (const viewport of [
  { width: 390, height: 844 },
  { width: 360, height: 800 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  test(`responsive ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await login(page);
    await page.screenshot({
      path: `test-results/home-${viewport.width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await openManualCard(page, "コピー機でA4資料をコピーする");
    await expect(
      page.getByRole("button", { name: /^(次へ|完了する)$/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/step-${viewport.width}.png`,
      fullPage: true,
    });
  });
}
test("Safety mode prevents offline advancement", async ({ page, context }) => {
  await login(page);
  await openManualCard(page, "台車に荷物を載せる");
  await expect(page.locator(".instruction")).toHaveAccessibleName(/保護メガネ/);
  await context.setOffline(true);
  await expect(
    page.getByRole("button", { name: /^(次へ|完了する)$/ }),
  ).toBeDisabled();
  await context.setOffline(false);
});
test("admin mobile layout", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await login(page, "admin");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/admin-360.png", fullPage: true });
});

test("create user and complete preference check", async ({ page }) => {
  await login(page, "admin");
  await page.getByRole("link", { name: "利用者", exact: true }).click();
  const username = "worker" + Date.now();
  await page.getByLabel("表示名").fill("テスト利用者");
  await page.getByLabel("ユーザー名", { exact: true }).fill(username);
  await page
    .getByLabel("パスワード", { exact: true })
    .fill("test-password-123");
  await page.getByRole("button", { name: "利用者を登録", exact: true }).click();
  await expect(
    page.getByText(
      "利用者を登録しました。ログイン後、表示の好みをチェックできます。",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(page).toHaveURL("/login");
  await page.getByLabel("ユーザー名", { exact: true }).fill(username);
  await page
    .getByLabel("パスワード", { exact: true })
    .fill("test-password-123");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByRole("link", { name: "表示の好みをチェック" }).click();
  await answerIntro(page, [2, 0, 1, 1, 1, 1, 0]);
  await page.locator(".choice").first().click();
  await page.getByRole("button", { name: "ここまでで表示を提案" }).click();
  await page.getByRole("button", { name: "この設定で使う" }).click();
  await expect(
    page.getByRole("heading", { name: "あなたに合う表示に" }),
  ).toBeVisible();
});

test("Service Worker notification click opens exact manual", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["notifications"], {
    origin: "http://127.0.0.1:5173",
  });
  await login(page);
  await expect
    .poll(() => page.evaluate(() => Notification.permission))
    .toBe("granted");
  const generation = await page.evaluate(async () => {
    const session = JSON.parse(localStorage.getItem("manu-session")!);
    const response = await fetch("/api/generations", {
      headers: { Authorization: "Bearer " + session.token },
    });
    return (await response.json())[0];
  });
  await page.evaluate(
    async ({ id }) => {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("通知クリック検証", {
        tag: "e2e-click",
        data: { url: "/app/manual/" + id },
      });
    },
    { id: generation.id },
  );
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(async () => {
    const sw = globalThis as any;
    const notifications = await sw.registration.getNotifications({
      tag: "e2e-click",
    });
    sw.dispatchEvent(
      new sw.NotificationEvent("notificationclick", {
        notification: notifications[0],
        action: "",
      }),
    );
  });
  await expect(page).toHaveURL("/app/manual/" + generation.id);
  await expect(
    page.getByRole("heading", { name: generation.title, exact: true }),
  ).toBeVisible();
});

test("manual deep link survives login", async ({ page, request }) => {
  const loginResponse = await request.post("/api/login", {
    data: { username: "demo", password: "manutailor-demo" },
  });
  const credentials = await loginResponse.json();
  const response = await request.get("/api/generations", {
    headers: { Authorization: "Bearer " + credentials.token },
  });
  const generation = (await response.json())[0];
  await page.goto("/app/manual/" + generation.id);
  await expect(page).toHaveURL("/login");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL("/app/manual/" + generation.id);
  await expect(
    page.getByRole("heading", { name: generation.title, exact: true }),
  ).toBeVisible();
});
