import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { type Server, createServer } from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';

import { findChromeExecutable, launchBrowser } from '../src/core/browser.js';

const originalHome = process.env.SIGNAL_FIRE_HOME;
const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-patchright-verify-'));
let verifyServer: Awaited<ReturnType<typeof startServer>> | undefined;

async function startServer(): Promise<{ server: Server; url: string }> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html>
<title>patchright verify</title>
<script>
  (async () => {
    const worker = await new Promise((resolve) => {
      const source = 'postMessage({ ua: navigator.userAgent });';
      const workerUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      let instance;
      try {
        instance = new Worker(workerUrl);
        instance.onmessage = (event) => {
          instance && instance.terminate();
          URL.revokeObjectURL(workerUrl);
          resolve(event.data);
        };
        instance.onerror = (event) => {
          instance && instance.terminate();
          URL.revokeObjectURL(workerUrl);
          resolve({ error: event.message });
        };
      } catch (error) {
        URL.revokeObjectURL(workerUrl);
        resolve({ error: error && error.message ? error.message : String(error) });
      }
    });

    document.body.textContent = JSON.stringify({
      chromeRuntimeType: typeof window.chrome?.runtime,
      chromeType: typeof window.chrome,
      userAgent: navigator.userAgent,
      userAgentDataBrands: navigator.userAgentData?.brands ?? null,
      webdriverType: typeof navigator.webdriver,
      webglGetParameterToString: Function.prototype.toString.call(
        WebGLRenderingContext.prototype.getParameter
      ),
      worker
    });
  })().catch((error) => {
    document.body.textContent = JSON.stringify({
      error: error && error.stack ? error.stack : String(error)
    });
  });
<\/script>`);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert.equal(typeof address, 'object');
      assert.notEqual(address, null);
      resolve({ server, url: `http://127.0.0.1:${address.port}/` });
    });
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err === undefined ? resolve() : reject(err)));
  });
}

try {
  const chromePath = findChromeExecutable();
  assert.notEqual(chromePath, null, 'Google Chrome was not found');

  process.env.SIGNAL_FIRE_HOME = tmpDir;
  verifyServer = await startServer();
  const { context, close } = await launchBrowser({
    accountId: 'verify-patchright',
    platform: 'x',
  });

  try {
    const page = await context.newPage();
    await page.goto(verifyServer.url, { waitUntil: 'domcontentloaded' });

    let result: {
      chromeRuntimeType: string;
      chromeType: string;
      error?: string;
      userAgent: string;
      userAgentDataBrands: Array<{ brand: string; version: string }> | null;
      webdriverType: string;
      webglGetParameterToString: string;
      worker: { error?: string; ua?: string };
    } | null = null;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const body = (await page.textContent('body'))?.trim() ?? '';
      if (body.startsWith('{')) {
        result = JSON.parse(body);
        break;
      }
      await page.waitForTimeout(100);
    }
    assert.notEqual(result, null, 'probe page did not produce JSON results');
    assert.equal(result.error, undefined, result.error);

    assert.match(result.userAgent, /Chrome\/\d+/, 'real Chrome UA was not detected');
    assert.doesNotMatch(result.userAgent, /HeadlessChrome/, 'headless UA leaked');
    assert.equal(result.webdriverType, 'undefined', 'navigator.webdriver is visible');
    assert.ok(Array.isArray(result.userAgentDataBrands), 'navigator.userAgentData.brands missing');
    assert.ok(
      result.userAgentDataBrands.some((brand) => brand.brand === 'Google Chrome'),
      'Google Chrome Client Hint brand missing',
    );
    assert.match(
      result.webglGetParameterToString,
      /\[native code\]/,
      'WebGL toString masking failed',
    );
    assert.equal(result.worker.ua, result.userAgent, 'worker UA differs from page UA');

    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          chromePath,
          chromeType: result.chromeType,
          chromeRuntimeType: result.chromeRuntimeType,
          userAgent: result.userAgent,
          userAgentDataBrands: result.userAgentDataBrands,
          webdriverType: result.webdriverType,
        },
        null,
        2,
      ),
    );
    process.stdout.write('\n');
  } finally {
    await close();
    if (verifyServer !== undefined) {
      await closeServer(verifyServer.server);
      verifyServer = undefined;
    }
  }
} finally {
  if (originalHome === undefined) {
    Reflect.deleteProperty(process.env, 'SIGNAL_FIRE_HOME');
  } else {
    process.env.SIGNAL_FIRE_HOME = originalHome;
  }
  if (verifyServer !== undefined) {
    await closeServer(verifyServer.server).catch(() => undefined);
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
}
