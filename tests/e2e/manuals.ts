import { type Page } from "@playwright/test";

export async function openManualCard(page: Page, title?: string) {
  const cards = page.locator(".manual-card");
  const card = title ? cards.filter({ hasText: title }).first() : cards.first();
  await card.evaluate((element) => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    }
  });
  await card.click();
}
