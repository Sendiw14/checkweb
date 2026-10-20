import type { Page } from "@playwright/test";

/**
 * Waits until every finite, time-based animation on the page has finished. Infinite ones are ignored here (they are
 * asserted separately with {@link infiniteAnimations}) and so are scroll-driven ones, which only progress when scrolled.
 */
export async function settled(page: Page, timeout = 6000) {
  await page.waitForFunction(
    () => document.getAnimations().every((a) => !(a.timeline instanceof DocumentTimeline) || a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
    undefined,
    { timeout },
  );
}

/** Names of animations that are running and never end. Anything auto-playing for over 5s fails WCAG 2.2.2. */
export async function infiniteAnimations(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.timeline instanceof DocumentTimeline && a.playState === "running" && a.effect?.getComputedTiming().iterations === Infinity)
      .map((a) => (a instanceof CSSAnimation ? a.animationName : a.id) || "(unnamed)"),
  );
}
