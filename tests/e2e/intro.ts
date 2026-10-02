import type { Page } from "@playwright/test";

export async function answerIntro(
  page: Page,
  choices: number[],
) {
  for (const choice of choices) {
    await page.locator(".preference-test .choice-grid .choice").nth(choice).click();
  }
}
