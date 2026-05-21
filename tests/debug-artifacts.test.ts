import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Page } from '../src/core/browser.js';
import {
  captureFailureArtifacts,
  compactHtmlSnippet,
  stripScriptTags,
} from '../src/core/debug-artifacts.js';

describe('debug artifact capture', () => {
  it('strips script tags from DOM snippets', () => {
    const html = '<html><script>secret()</script><body><div>Visible</div></body></html>';

    expect(stripScriptTags(html)).not.toContain('secret()');
    expect(compactHtmlSnippet(html)).toContain('Visible');
  });

  it('writes screenshot and sanitized DOM artifacts', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-debug-'));
    const page = {
      url: () => 'https://example.test/compose',
      screenshot: async (options: { path: string }) => {
        await fs.writeFile(options.path, 'fake-png');
      },
      content: async () =>
        '<html><script>secret()</script><body><div>Selector drift</div></body></html>',
    } as unknown as Page;

    const result = await captureFailureArtifacts('x', page, { root: tmpDir });

    expect(result.url).toBe('https://example.test/compose');
    expect(result.screenshotPath).toMatch(/\.png$/);
    expect(result.domPath).toMatch(/\.txt$/);
    expect(result.summary).toContain('https://example.test/compose');
    expect(result.summary).toContain(path.join(tmpDir, 'ui', 'debug'));

    const domText = await fs.readFile(result.domPath ?? '', 'utf8');
    expect(domText).toContain('Selector drift');
    expect(domText).not.toContain('secret()');
  });
});
