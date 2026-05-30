import { type Locator, type Page, isLocatorVisible } from './browser.js';
import { humanClick } from './mouse.js';

/**
 * Clicks the first locator in `locators` that becomes visible within `timeoutMs`.
 * Returns true once a click succeeds, false if none were visible.
 *
 * With `{ tryAncestor: true }`, if the direct click throws, it retries by clicking the
 * nearest actionable ancestor (button/link/role=button/role=link) before moving to the
 * next locator. Without it, a failing click propagates (no try/catch) — matching the
 * original Facebook/LinkedIn behavior.
 */
export async function clickFirstVisible(
  page: Page,
  locators: Locator[],
  timeoutMs: number,
  options: { tryAncestor?: boolean } = {},
): Promise<boolean> {
  for (const locator of locators) {
    const candidate = locator.first();
    if (!(await isLocatorVisible(candidate, timeoutMs))) continue;
    if (options.tryAncestor) {
      try {
        await humanClick(page, candidate);
        return true;
      } catch {
        try {
          await humanClick(
            page,
            candidate.locator(
              'xpath=ancestor::*[self::button or self::a or @role="button" or @role="link"][1]',
            ),
          );
          return true;
        } catch {
          // Try the next locator.
        }
      }
    } else {
      await humanClick(page, candidate);
      return true;
    }
  }
  return false;
}
