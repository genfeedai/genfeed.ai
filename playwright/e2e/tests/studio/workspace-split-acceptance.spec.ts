import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { expect, test } from '@playwright/test';
import { renderCounterScript } from '../../../../scripts/acceptance/studio-workspace/compare.mjs';
import { createAuthenticatedPage } from '../../fixtures/auth.fixture';
import { installWorkspaceSplitFixture } from '../../fixtures/studio-workspace-split.fixture';
import { brandPath } from '../../utils/app-chrome';
import { selectAdvancedModel } from '../../utils/generation-setup';

// Opt-in evidence setup; ordinary CI does not capture or replace baselines.
// biome-ignore lint/suspicious/noUndeclaredEnvVars: direct evidence runner, never a cached Turbo task
const output = process.env.STUDIO_SPLIT_EVIDENCE_DIR;
for (const width of [375, 1440]) {
  test(`workspace split acceptance ${width}`, async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    test.skip(
      !output,
      'Set STUDIO_SPLIT_EVIDENCE_DIR to an empty evidence directory',
    );
    test.setTimeout(180_000);
    if (!baseURL || !/\.localhost$/.test(new URL(baseURL).hostname))
      throw new Error('An isolated local Portless URL is required');
    const blockedRequests: string[] = [];
    const appOrigin = new URL(baseURL).origin;
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === appOrigin && !url.pathname.startsWith('/v1/'))
        return route.continue();
      blockedRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
      return route.abort('blockedbyclient');
    });
    await context.routeWebSocket('**/*', (connection) => {
      const url = new URL(connection.url());
      if (
        url.hostname === new URL(appOrigin).hostname &&
        url.pathname.startsWith('/_next/')
      )
        connection.connectToServer();
      else connection.close();
    });
    await page.addInitScript({ content: renderCounterScript });
    await page.addInitScript(() =>
      Object.assign(window, { __playwright_socket_fixture: true }),
    );
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.clock.setFixedTime(new Date('2026-10-23T12:00:00Z'));
    await createAuthenticatedPage(page, context, {}, '/playwright-ready');
    const fixture = await installWorkspaceSplitFixture(page);
    // Page routes outrank context routes. Keep the final deny gate above every
    // inherited API mock, including mocks whose unmatched path calls continue.
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === appOrigin) return route.fallback();
      if (
        url.hostname === 'cdn.genfeed.ai' &&
        url.pathname.startsWith('/mock/workspace-split-')
      )
        return route.fallback();
      if (url.hostname === 'cdn.genfeed.ai')
        return route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#384b62"/></svg>',
        });
      blockedRequests.push(
        `${route.request().method()} ${url.origin}${url.pathname}`,
      );
      return route.abort('blockedbyclient');
    });
    await page.goto(brandPath(APP_ROUTES.STUDIO.PLAYGROUND), {
      waitUntil: 'domcontentloaded',
    });
    const editor = page
      .getByTestId('studio-playground-prompt')
      .getByRole('textbox');
    await expect(editor).toBeVisible();
    await selectAdvancedModel(page, 'FLUX.3');
    await page.keyboard.press('Escape');
    await expect(
      page.getByTestId('studio-asset-workspace-split-existing'),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() =>
      Promise.all(
        Array.from(document.images, (image) => image.decode().catch(() => {})),
      ),
    );
    const screenshots: Record<string, string> = {};
    const capture = async (state: string) => {
      const filename = `workspace-${width}-${state}.png`;
      const bytes = await page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        fullPage: false,
      });
      await writeFile(path.join(output ?? '', filename), bytes, { flag: 'wx' });
      screenshots[state] = createHash('sha256').update(bytes).digest('hex');
    };
    await mkdir(output ?? '', { recursive: true });
    await capture('idle');
    await editor.fill('Synthetic workspace acceptance image');
    await page.evaluate('window.__studioSplitCounter.reset()');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect.poll(fixture.hasAdmission).toBe(true);
    await fixture.admit();
    const tile = page.getByTestId(`studio-asset-${fixture.id}`);
    await expect(tile).toBeVisible();
    await capture('pending');
    await expect.poll(fixture.hasSocket).toBe(true);
    fixture.complete();
    await expect(tile).toHaveAttribute('data-asset-media-state', 'ready');
    await expect(tile.locator('img').first()).toBeVisible();
    await page.evaluate(() =>
      Promise.all(
        Array.from(document.images, (image) => image.decode().catch(() => {})),
      ),
    );
    await capture('complete');
    const counter = await page.evaluate<{
      renders: Record<string, number>;
      errors: string[];
      rendererCount: number;
    }>('window.__studioSplitCounter.read()');
    expect(counter.errors).toEqual([]);
    expect(counter.rendererCount).toBeGreaterThan(0);
    for (const name of [
      'StudioPlaygroundWorkspace',
      'StudioPlaygroundComposer',
      'StudioPlaygroundResults',
    ])
      expect(counter.renders[name]).toBeGreaterThan(0);
    expect(fixture.generationRequests()).toBe(1);
    expect(blockedRequests).toEqual([]);
    const receipt = {
      browser: browser.version(),
      fixture: 'workspace-split-v1',
      sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim(),
      viewport: { width, height: 1000 },
      screenshots,
      renders: counter.renders,
      counterErrors: counter.errors,
      generationRequests: fixture.generationRequests(),
      blockedRequests,
    };
    await writeFile(
      path.join(output ?? '', `workspace-${width}.json`),
      JSON.stringify(receipt, null, 2),
      { flag: 'wx' },
    );
  });
}
