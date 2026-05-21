import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { getSignalFireHome } from './account-id.js';
import type { Page } from './browser.js';

const DEBUG_DOM_SNIPPET_LIMIT = 500;

export interface DebugCaptureResult {
  url: string;
  screenshotPath?: string;
  screenshotError?: string;
  domPath?: string;
  domError?: string;
  summary: string;
}

export function stripScriptTags(html: string): string {
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
}

export function compactHtmlSnippet(html: string, limit = DEBUG_DOM_SNIPPET_LIMIT): string {
  return stripScriptTags(html).replace(/\s+/g, ' ').trim().slice(0, limit);
}

export async function captureFailureArtifacts(
  platform: string,
  page: Page,
  options?: { root?: string; dir?: string },
): Promise<DebugCaptureResult> {
  const dir = options?.dir ?? path.join(options?.root ?? getSignalFireHome(), 'ui', 'debug');
  await fs.mkdir(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safePlatform = platform.replace(/[^A-Za-z0-9_-]/g, '_') || 'platform';
  const baseName = `${safePlatform}-${stamp}-${randomUUID().slice(0, 8)}`;
  const screenshotPath = path.join(dir, `${baseName}.png`);
  const domPath = path.join(dir, `${baseName}.txt`);
  const url = page.url();

  const result: DebugCaptureResult = { url, summary: '' };

  try {
    await page.screenshot({ path: screenshotPath, fullPage: false });
    result.screenshotPath = screenshotPath;
  } catch (err) {
    result.screenshotError = err instanceof Error ? err.message : String(err);
  }

  try {
    const html = await page.content();
    await fs.writeFile(domPath, `url: ${url}\n\n${compactHtmlSnippet(html)}\n`, 'utf8');
    result.domPath = domPath;
  } catch (err) {
    result.domError = err instanceof Error ? err.message : String(err);
  }

  const screenshotDetail =
    result.screenshotPath ?? `screenshot failed: ${result.screenshotError ?? 'unknown'}`;
  const domDetail = result.domPath ?? `dom failed: ${result.domError ?? 'unknown'}`;
  result.summary = `URL: ${url}\nScreenshot: ${screenshotDetail}\nDOM snippet: ${domDetail}`;

  return result;
}
