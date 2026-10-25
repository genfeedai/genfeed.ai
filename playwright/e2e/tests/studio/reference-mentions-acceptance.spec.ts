import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROUTES, MODEL_KEYS } from '@genfeedai/contracts/constants';
import { expect, test } from '@playwright/test';
import { createAuthenticatedPage } from '../../fixtures/auth.fixture';
import { installWorkspaceSplitFixture } from '../../fixtures/studio-workspace-split.fixture';
import { buildProtectedAppBootstrapPayload } from '../../utils/api-interceptor';
import { brandPath } from '../../utils/app-chrome';

// Opt-in evidence only. The same source file captures both variants; never
// invoke Quote, Generate, a provider, or a real backend while collecting it.
// biome-ignore lint/suspicious/noUndeclaredEnvVars: direct local evidence runner
const output = process.env.STUDIO_REFERENCE_EVIDENCE_DIR;
// biome-ignore lint/suspicious/noUndeclaredEnvVars: before/after changes assertions, not application behavior
const variant = process.env.STUDIO_REFERENCE_EVIDENCE_VARIANT;
const model = MODEL_KEYS.REPLICATE_MINIMAX_H3;
const references = [
  {
    id: 'reference-person',
    name: 'Person',
    category: 'IMAGE',
    role: 'reference',
  },
  {
    id: 'reference-driver',
    name: 'Facial driver',
    category: 'VIDEO',
    role: 'videoReference',
  },
  {
    id: 'reference-voice',
    name: 'Voiceover',
    category: 'AUDIO',
    role: 'audioReference',
  },
];
const sourceFiles = [
  'packages/pages/studio/playground/StudioPlaygroundWorkspace.tsx',
  'packages/pages/studio/playground/components/StudioPlaygroundComposer.tsx',
  'packages/props/studio/studio-playground.props.ts',
];

for (const width of [1440, 390]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`reference mentions ${width} ${theme}`, async ({
      page,
      context,
      browser,
      baseURL,
    }) => {
      test.skip(
        !output,
        'Set STUDIO_REFERENCE_EVIDENCE_DIR to an empty evidence directory',
      );
      test.setTimeout(180_000);
      if (!baseURL || !/\.localhost$/.test(new URL(baseURL).hostname))
        throw new Error(
          'An isolated canonical HTTPS Portless origin is required',
        );
      if (variant !== 'before' && variant !== 'after')
        throw new Error(
          'Set STUDIO_REFERENCE_EVIDENCE_VARIANT to before or after',
        );
      const origin = new URL(baseURL).origin;
      const blockedRequests: string[] = [];
      const generationRequests: string[] = [];
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin === origin && !url.pathname.startsWith('/v1/'))
          return route.continue();
        blockedRequests.push(
          `${route.request().method()} ${url.origin}${url.pathname}`,
        );
        return route.abort('blockedbyclient');
      });
      await context.routeWebSocket('**/*', (connection) => {
        const url = new URL(connection.url());
        if (
          url.origin.replace('wss:', 'https:') === origin &&
          url.pathname.startsWith('/_next/')
        )
          connection.connectToServer();
        else connection.close();
      });
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.clock.setFixedTime(new Date('2026-10-25T09:00:00Z'));
      await page.addInitScript((value) => {
        localStorage.setItem('theme', value);
        Object.assign(window, { __playwright_socket_fixture: true });
      }, theme);
      await createAuthenticatedPage(page, context, {}, '/playwright-ready');
      await installWorkspaceSplitFixture(page);
      await page.route('**/v1/auth/bootstrap**', (route) => {
        const bootstrap = buildProtectedAppBootstrapPayload();
        return route.fulfill({
          json: {
            ...bootstrap,
            currentUser: { ...bootstrap.currentUser, settings: { theme } },
            settings: { ...bootstrap.settings, enabledModelIds: [model] },
          },
        });
      });
      await page.route('**/v1/models**', (route) =>
        route.fulfill({
          json: {
            data: [
              {
                id: 'reference-model',
                type: 'models',
                attributes: {
                  key: model,
                  label: 'MiniMax H3',
                  provider: 'replicate',
                  category: 'video',
                  isDefault: true,
                  isActive: true,
                  isDeleted: false,
                  cost: 8,
                  maxOutputs: 1,
                },
              },
            ],
            meta: { totalCount: 1 },
          },
        }),
      );
      await page.route('**/v1/studio-generate-drafts/current**', (route) =>
        route.fulfill({
          json: {
            data:
              route.request().method() === 'GET'
                ? {
                    id: 'reference-draft',
                    type: 'studio-generate-drafts',
                    attributes: {
                      brandId: 'brand-1',
                      organizationId: 'mock-org-id-e2e-test',
                      userId: 'mock-user-id-e2e-test',
                      type: 'video',
                      prompt: 'Use the attached references. ',
                      attachments: [],
                      references: references.map(({ id, role }, order) => ({
                        id,
                        role,
                        order,
                      })),
                      knowledgeSelection: {},
                      settingsByType: {
                        video: {
                          modelKey: model,
                          duration: 5,
                          aspectRatio: '16:9',
                          resolution: '2K',
                          outputs: 1,
                        },
                      },
                      droppedReferenceIds: [],
                    },
                  }
                : {
                    id: 'reference-draft',
                    type: 'studio-generate-drafts',
                    attributes: route.request().postDataJSON(),
                  },
          },
        }),
      );
      await page.route('**/v1/ingredients/batch?**', (route) =>
        route.fulfill({
          json: {
            data: references.map((reference) => ({
              id: reference.id,
              type: 'ingredients',
              attributes: {
                brandId: 'brand-1',
                organizationId: 'mock-org-id-e2e-test',
                category: reference.category,
                scope: 'USER',
                status: 'GENERATED',
                label: reference.name,
                s3Key: `mock/${reference.id}`,
                cdnUrl: `https://cdn.genfeed.ai/mock/${reference.id}.svg`,
                metadata: {
                  label: reference.name,
                  duration: 5,
                  width: 1024,
                  height: 768,
                },
              },
            })),
          },
        }),
      );
      // This page-level gate outranks every inherited mock and refuses any
      // generation write, even if an accidental click reached a mocked route.
      await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (
          request.method() === 'POST' &&
          /^\/v1\/(images|videos|voices|musics|avatars)(\/generate)?$/.test(
            url.pathname,
          )
        ) {
          generationRequests.push(url.pathname);
          return route.abort('blockedbyclient');
        }
        if (url.origin === origin) return route.fallback();
        if (url.hostname === 'cdn.genfeed.ai')
          return route.fulfill({
            contentType: 'image/svg+xml',
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#53677a"/><circle cx="32" cy="23" r="12" fill="#dfbd9e"/><path d="M12 64v-9a20 20 0 0 1 40 0v9" fill="#273442"/></svg>',
          });
        blockedRequests.push(
          `${request.method()} ${url.origin}${url.pathname}`,
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
      await expect(editor).toContainText('Use the attached references.');
      await expect(page.locator('html')).toHaveClass(
        new RegExp(`\\b${theme}\\b`),
      );
      await page.evaluate(() => document.fonts.ready);
      await editor.press('End');
      await editor.pressSequentially('@');
      if (variant === 'after') {
        const menu = page.getByTestId('studio-reference-mention-list');
        await expect(menu).toBeVisible();
        for (const token of ['@Image1', '@Video1', '@Audio1'])
          await expect(menu).toContainText(token);
      } else
        await expect(
          page.getByTestId('studio-reference-mention-list'),
        ).toHaveCount(0);
      const screenshots: Record<string, string> = {};
      await mkdir(output ?? '', { recursive: true });
      const capture = async (state: string) => {
        const bytes = await page.screenshot({
          animations: 'disabled',
          caret: 'hide',
          fullPage: false,
        });
        const filename = `references-${variant}-${width}-${theme}-${state}.png`;
        await writeFile(path.join(output ?? '', filename), bytes, {
          flag: 'wx',
        });
        screenshots[filename] = createHash('sha256')
          .update(bytes)
          .digest('hex');
      };
      await capture('suggestions');
      await editor.press('Escape');
      await editor.fill('Use @Image9 with the attached references.');
      if (variant === 'after') {
        await expect(
          page.getByTestId('studio-reference-mention-error'),
        ).toContainText('@Image9');
        await expect(
          page.getByRole('button', { name: 'Generate', exact: true }),
        ).toHaveAttribute('aria-disabled', 'true');
      }
      await capture('unmatched');
      expect(generationRequests).toEqual([]);
      expect(blockedRequests).toEqual([]);
      const sourceHashes = Object.fromEntries(
        await Promise.all(
          sourceFiles.map(async (file) => [
            file,
            createHash('sha256')
              .update(await readFile(path.resolve(file)))
              .digest('hex'),
          ]),
        ),
      );
      await writeFile(
        path.join(output ?? '', `references-${variant}-${width}-${theme}.json`),
        JSON.stringify(
          {
            browser: browser.version(),
            fixture: 'studio-reference-mentions-v1',
            variant,
            viewport: { width, height: 1000 },
            theme,
            sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], {
              encoding: 'utf8',
            }).trim(),
            sourceHashes,
            screenshots,
            generationRequests,
            blockedRequests,
            invokedQuoteOrGenerate: false,
            liveProviderAcceptance: false,
          },
          null,
          2,
        ),
        { flag: 'wx' },
      );
    });
  }
}
