import { writeFile } from 'node:fs/promises';
import { brandPath } from '@e2e/utils/app-chrome';
import {
  APP_ROUTES,
  FLUX_3_IMAGE_CONTRACT_VERSION,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import type { Route, WebSocketRoute } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { buildProtectedAppBootstrapPayload } from '../../utils/api-interceptor';

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=',
  'base64',
);
const model = MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE;
const count = 20;

function percentile95(samples: number[]): number {
  return [...samples].sort((a, b) => a - b)[
    Math.ceil(samples.length * 0.95) - 1
  ];
}

test('measures twenty actual pending, sibling and completion UI transitions', async ({
  authenticatedPage: page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.addInitScript(() =>
    Object.assign(window, { __playwright_socket_fixture: true }),
  );
  await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket('**/socket.io/**', (connection) => {
    socket = connection;
    connection.send(
      '0' +
        JSON.stringify({
          sid: 'feedback-fixture',
          upgrades: [],
          pingInterval: 25000,
          pingTimeout: 20000,
          maxPayload: 1000000,
        }),
    );
    connection.onMessage((message) => {
      if (typeof message === 'string' && message.startsWith('40'))
        connection.send('40' + JSON.stringify({ sid: 'feedback-fixture' }));
      if (message === '2') connection.send('3');
    });
  });
  const complete = new Set<string>(['sibling-a', 'sibling-b']);
  const image = (id: string) => ({
    id,
    type: 'ingredients',
    attributes: {
      brandId: 'brand-1',
      organizationId: 'mock-org-id-e2e-test',
      category: 'IMAGE',
      scope: 'USER',
      status: complete.has(id) ? 'GENERATED' : 'PROCESSING',
      cdnUrl: `https://cdn.genfeed.ai/mock/${id}.png`,
      width: 1024,
      height: 768,
      createdAt: '2026-10-10T00:00:00Z',
      ...(id.startsWith('sibling-') ? { parentId: 'fixture-parent' } : {}),
      prompt: { original: id },
      generationHarness: {
        brandId: 'brand-1',
        originalPrompt: id,
        enhancedPrompt: id,
        status: 'skipped',
        source: 'request',
        appliedPacks: [],
      },
      metadata: { label: id, model, width: 1024, height: 768 },
    },
  });
  await page.route('**/cdn.genfeed.ai/mock/*.png', (r) =>
    r.fulfill({ contentType: 'image/png', body: pixel }),
  );
  await page.route('**/v1/auth/bootstrap**', (r) => {
    const b = buildProtectedAppBootstrapPayload();
    return r.fulfill({
      json: { ...b, settings: { ...b.settings, enabledModelIds: [model] } },
    });
  });
  await page.route('**/v1/models**', (r) =>
    r.fulfill({
      json: {
        data: [
          {
            id: 'feedback-model',
            type: 'models',
            attributes: {
              key: model,
              label: 'FLUX.3',
              provider: 'replicate',
              category: 'image',
              isDefault: true,
              isActive: true,
              isDeleted: false,
              cost: 8,
              maxOutputs: 1,
              reviewedProviderContractVersion: FLUX_3_IMAGE_CONTRACT_VERSION,
            },
          },
        ],
        meta: { totalCount: 1 },
      },
    }),
  );
  await page.route('**/v1/studio-generate-drafts/current**', (r) =>
    r.fulfill({
      json:
        r.request().method() === 'GET'
          ? { data: null }
          : {
              data: {
                id: 'feedback-draft',
                type: 'studio-generate-drafts',
                attributes:
                  r.request().postDataJSON()?.data?.attributes ??
                  r.request().postDataJSON(),
              },
            },
    }),
  );
  await page.route('**/v1/ingredients**', (r) => {
    const url = new URL(r.request().url());
    if (/\/(posts|children)$/.test(url.pathname))
      return r.fulfill({ json: { data: [] } });
    const id = url.pathname.split('/').at(-1);
    return r.fulfill({
      json:
        id && id !== 'ingredients'
          ? { data: image(id) }
          : {
              data: [...complete].map(image),
              meta: { page: 1, pageSize: 100, totalCount: complete.size },
            },
    });
  });
  let admission: Route | undefined;
  let currentId = '';
  await page.route('**/v1/images', (r) => {
    admission = r;
  });
  await page.route('**/v1/images/**', (r) => {
    const id = new URL(r.request().url()).pathname.split('/').at(-1) ?? '';
    return r.fulfill({ json: { data: image(id) } });
  });
  await page.goto(brandPath(APP_ROUTES.STUDIO.PLAYGROUND), {
    waitUntil: 'domcontentloaded',
  });
  const editor = page
    .getByTestId('studio-playground-prompt')
    .getByRole('textbox');
  await expect(editor).toBeVisible();
  await page.getByRole('button', { name: /^Generation setup:/ }).click();
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await page
    .getByRole('button', { name: 'Configure Model', exact: true })
    .click();
  await page.getByRole('option').filter({ hasText: 'FLUX.3' }).first().click();
  await page.keyboard.press('Escape');
  const pending: number[] = [],
    sibling: number[] = [],
    completion: number[] = [];
  // Observe in-page DOM changes from the native click event, excluding automation
  // transport/actionability delays from the interaction budget.
  const observe = async (
    selector: string,
    predicate: 'pending' | 'selected' | 'ready',
  ) => {
    await page.evaluate(
      ({ selector, predicate }) => {
        const state = { start: 0, duration: 0 };
        (window as unknown as Record<string, unknown>).feedbackTiming = state;
        const click = () => {
          state.start = performance.now();
          document.removeEventListener('click', click, true);
        };
        document.addEventListener('click', click, true);
        const observer = new MutationObserver(() => {
          const element = document.querySelector(selector);
          const done =
            element &&
            (predicate === 'pending'
              ? /Submitting|Queued|Generating/i.test(element.textContent ?? '')
              : predicate === 'selected'
                ? element.getAttribute('aria-pressed') === 'true' &&
                  Boolean(
                    document.querySelector(
                      `[data-testid="studio-playground-inspector"] img[src*="/mock/${element.getAttribute('aria-label')}.png"]`,
                    ),
                  ) &&
                  Array.from(
                    document.querySelectorAll<HTMLButtonElement>(
                      '[data-testid="studio-playground-inspector"] button',
                    ),
                  ).some(
                    (button) =>
                      button.textContent?.trim() === 'Edit image' &&
                      !button.disabled,
                  )
                : element.getAttribute('data-asset-media-state') === 'ready');
          if (state.start && done) {
            state.duration = performance.now() - state.start;
            observer.disconnect();
          }
        });
        observer.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
      },
      { selector, predicate },
    );
  };
  const readDuration = async () => {
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as Record<string, { duration: number }>)
              .feedbackTiming.duration,
        ),
      )
      .toBeGreaterThan(0);
    return page.evaluate(
      () =>
        (window as unknown as Record<string, { duration: number }>)
          .feedbackTiming.duration,
    );
  };
  for (let i = 0; i < count; i++) {
    currentId = `feedback-result-${i}`;
    admission = undefined;
    await editor.fill(`Fixture sample ${i}`);
    await observe('[data-testid^="studio-asset-submitting-"]', 'pending');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    pending.push(await readDuration());
    await expect.poll(() => Boolean(admission)).toBe(true);
    await admission?.fulfill({
      json: {
        data: {
          ...image(currentId),
          attributes: {
            ...image(currentId).attributes,
            pendingIngredientIds: [currentId],
          },
        },
      },
    });
    const tile = page.getByTestId(`studio-asset-${currentId}`);
    await expect(tile).toBeVisible();
    await expect.poll(() => Boolean(socket)).toBe(true);
    // The event-to-tile boundary uses the same observer but starts immediately
    // before sending the deterministic broker event; no provider is contacted.
    await observe(`[data-testid="studio-asset-${currentId}"]`, 'ready');
    await page.evaluate(() => {
      (
        window as unknown as Record<string, { start: number }>
      ).feedbackTiming.start = performance.now();
    });
    complete.add(currentId);
    socket?.send(
      '42' +
        JSON.stringify([
          `/images/${currentId}`,
          { status: 'completed', result: { id: currentId } },
        ]),
    );
    completion.push(await readDuration());
    await expect(tile).toHaveAttribute('data-asset-media-state', 'ready');
  }
  await page.getByTestId('studio-asset-sibling-a').click();
  await page.getByTestId('studio-open-focused-preview').click();
  const focused = page.getByTestId('studio-focused-preview');
  for (let i = 0; i < count; i++) {
    const id = i % 2 === 0 ? 'sibling-b' : 'sibling-a';
    await observe(
      `[data-testid="studio-focused-preview"] button[aria-label="${id}"]`,
      'selected',
    );
    await focused.getByRole('button', { name: id, exact: true }).click();
    sibling.push(await readDuration());
    await expect(
      focused.getByRole('button', { name: id, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  }
  const receipt = {
    kind: 'deterministic-browser-fixture',
    samples: { pending, sibling, completion },
    p95: {
      pending: percentile95(pending),
      sibling: percentile95(sibling),
      completion: percentile95(completion),
    },
    providerInterval: 'unavailable: fixture',
    queueInterval: 'unavailable: fixture',
    coldMediaInterval: 'unavailable: warmed fixture media',
  };
  const receiptPath = testInfo.outputPath('playground-feedback-timings.json');
  await writeFile(receiptPath, JSON.stringify(receipt));
  await testInfo.attach('playground-feedback-timings.json', {
    path: receiptPath,
    contentType: 'application/json',
  });
  console.log('PLAYGROUND_FEEDBACK_P95_MS', JSON.stringify(receipt.p95));
  expect(receipt.p95.pending).toBeLessThanOrEqual(250);
  expect(receipt.p95.sibling).toBeLessThanOrEqual(250);
  expect(receipt.p95.completion).toBeLessThanOrEqual(1000);
});
