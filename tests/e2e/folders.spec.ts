import { test, expect } from "@playwright/test";

test("admin files a manual under a folder and category", async ({ page }) => {
  test.setTimeout(30000);
  const folder = "作業 " + Date.now();
  const title = "仕分け確認 " + Date.now();
  await page.goto("/login");
  await page.getByLabel("ユーザー名", { exact: true }).fill("admin");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page
    .getByRole("link", { name: "フォルダとカテゴリー", exact: true })
    .click();
  await page.getByLabel("フォルダ名").fill(folder);
  await page.getByRole("button", { name: "追加" }).first().click();
  await expect(page.locator(".manual-folder > summary").filter({ hasText: folder })).toBeVisible();
  await page.getByLabel("入れるフォルダ").selectOption({ label: folder });
  await page.getByLabel("カテゴリー名").fill("備品");
  await page.getByRole("button", { name: "追加" }).last().click();
  await page.getByRole("link", { name: "標準マニュアル", exact: true }).click();
  await page.getByRole("link", { name: "登録する" }).click();
  await page.getByLabel("マニュアルの名前").fill(title);
  await page.getByLabel("または原文を入力").fill("1. 備品を確認してください。");
  await page
    .getByRole("combobox", { name: "フォルダ", exact: true })
    .selectOption({ label: folder });
  await page
    .getByRole("combobox", { name: "カテゴリー", exact: true })
    .selectOption({ label: "備品" });
  await page.getByRole("button", { name: "登録して内容を確認" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("link", { name: "標準マニュアル", exact: true }).click();
  const group = page.locator(".manual-folder").filter({ has: page.locator("summary").filter({ hasText: folder }) });
  await expect(group).not.toHaveAttribute("open", "");
  await group.locator(":scope > summary").click();
  const category = group.locator(".manual-category").filter({ hasText: "備品" });
  await expect(category.locator(":scope > summary")).toBeVisible();
  await category.locator(":scope > summary").click();
  await expect(
    group.getByRole("link", { name: new RegExp(title) }),
  ).toBeVisible();
});

test("server settings keep multiple destinations", async ({ page }) => {
  await page.goto("/servers");
  await page.getByLabel("サーバー名").fill("事務所");
  await page.getByLabel("URL").fill("http://10.12.24.147:8000");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByLabel("サーバー名").fill("外部");
  await page.getByLabel("URL").fill("https://manual.example.com");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("事務所", { exact: false })).toBeVisible();
  await expect(page.getByText("外部", { exact: false })).toBeVisible();
  await expect(page.getByText("個人サーバー", { exact: false }).first()).toBeVisible();
  await page.goto("/login");
  const tabs = page.getByRole("tablist", { name: "接続先サーバー" });
  await expect(tabs.getByRole("tab", { name: "個人サーバー" })).toHaveAttribute("aria-selected", "true");
  await tabs.getByRole("tab", { name: "外部" }).click();
  await expect(tabs.getByRole("tab", { name: "外部" })).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(page.getByRole("tab", { name: "外部" })).toHaveAttribute("aria-selected", "true");
});
