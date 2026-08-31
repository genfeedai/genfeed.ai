import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page, type Route, test } from '@playwright/test';
import {
  generateMockPost,
  mockActiveSubscription,
  mockBrandsData,
  mockLibraryData,
  mockNodeTypes,
  mockPostsList,
  mockWorkflowCrud,
  mockWorkflowTemplates,
} from '../fixtures/api-mocks.fixture';
import { createAuthenticatedPage } from '../fixtures/auth.fixture';
import {
  testNodeTypes,
  testWorkflows,
  testWorkflowTemplates,
} from '../fixtures/test-data.fixture';
import {
  generateMockApiUser,
  generateMockBrand,
  generateMockOrganization,
} from '../utils/api-interceptor';
import { settle } from '../utils/interaction-helpers';

const E2E_ORG_SLUG = 'test-org';
const E2E_BRAND_SLUG = 'brand-1';

function brandPath(routePath: string): string {
  return `/${E2E_ORG_SLUG}/${E2E_BRAND_SLUG}${routePath}`;
}

function orgPath(routePath: string): string {
  return `/${E2E_ORG_SLUG}/~${routePath}`;
}

/**
 * Writes README PNGs to docs/assets/readme/ from the mocked app-core shell.
 *
 * Run: `bun run readme:capture`
 * Not collected by CI e2e (lives outside playwright/e2e/tests/).
 */

const README_ASSETS_DIR = path.resolve(process.cwd(), 'docs/assets/readme');

const VIEWPORT = { height: 900, width: 1440 };

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const README_POSTS = [
  generateMockPost({
    description: 'Caption for the studio drop',
    id: 'readme-post-draft',
    label: 'Studio drop',
    status: 'draft',
  }),
  generateMockPost({
    description: 'Queued for the weekly slot',
    id: 'readme-post-scheduled',
    label: 'Weekly still',
    scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'scheduled',
  }),
  generateMockPost({
    description: 'Published sample post',
    id: 'readme-post-public',
    label: 'Launch still',
    status: 'public',
    totalComments: 8,
    totalLikes: 24,
    totalViews: 180,
  }),
];

const LIBRARY_IMAGES = [
  {
    category: 'image',
    format: 'png',
    height: 1024,
    id: 'readme-image-hero',
    ingredientUrl: 'https://cdn.genfeed.ai/mock/images/hero-banner.png',
    metadataLabel: 'Studio still',
    status: 'completed',
    thumbnailUrl: 'https://cdn.genfeed.ai/mock/images/hero-banner-thumb.jpg',
    url: 'https://cdn.genfeed.ai/mock/images/hero-banner.png',
    width: 1920,
  },
  {
    category: 'image',
    format: 'png',
    height: 1024,
    id: 'readme-image-product',
    ingredientUrl: 'https://cdn.genfeed.ai/mock/images/product-shot.png',
    metadataLabel: 'Product frame',
    status: 'completed',
    thumbnailUrl: 'https://cdn.genfeed.ai/mock/images/product-shot-thumb.jpg',
    url: 'https://cdn.genfeed.ai/mock/images/product-shot.png',
    width: 1024,
  },
  {
    category: 'image',
    format: 'png',
    height: 1080,
    id: 'readme-image-social',
    ingredientUrl: 'https://cdn.genfeed.ai/mock/images/social-post.png',
    metadataLabel: 'Social frame',
    status: 'completed',
    thumbnailUrl: 'https://cdn.genfeed.ai/mock/images/social-post-thumb.jpg',
    url: 'https://cdn.genfeed.ai/mock/images/social-post.png',
    width: 1080,
  },
  {
    category: 'image',
    format: 'png',
    height: 1024,
    id: 'readme-image-mood',
    ingredientUrl: 'https://cdn.genfeed.ai/mock/images/moodboard.png',
    metadataLabel: 'Mood board',
    status: 'completed',
    thumbnailUrl: 'https://cdn.genfeed.ai/mock/images/moodboard-thumb.jpg',
    url: 'https://cdn.genfeed.ai/mock/images/moodboard.png',
    width: 1024,
  },
];

interface CaptureTarget {
  fileName: string;
  path: string;
  prepare?: (page: Page) => Promise<void>;
  readySelector?: string;
}

const CAPTURE_TARGETS: CaptureTarget[] = [
  {
    fileName: 'agent-shell.png',
    path: orgPath('/agent/new'),
    prepare: async (page: Page) => {
      const input = page
        .locator(
          '[data-testid="agent-chat-input-shell"] [contenteditable="true"]',
        )
        .first();
      if (await input.isVisible().catch(() => false)) {
        await input.click().catch(() => {});
        await input
          .fill('Draft a studio still for the weekly drop')
          .catch(() => {});
      }
    },
    readySelector:
      '[data-testid="agent-chat-input-shell"] [contenteditable="true"]',
  },
  {
    fileName: 'publishing-desk.png',
    path: brandPath('/publishing/overview'),
  },
  {
    fileName: 'automation-workflows.png',
    path: `${brandPath('/automation/workflows')}/workflow-001`,
  },
];

async function buildPlaceholderPng(
  page: Page,
  hueShift: number,
): Promise<Buffer> {
  const dataUrl = await page.evaluate((shift: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 960;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable');
    }
    const gradient = ctx.createLinearGradient(0, 0, 960, 960);
    gradient.addColorStop(0, `hsl(${220 + shift} 18% 10%)`);
    gradient.addColorStop(0.5, `hsl(${260 + shift} 22% 18%)`);
    gradient.addColorStop(1, `hsl(${200 + shift} 28% 14%)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 960, 960);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.arc(480, 430, 190, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 8;
    ctx.strokeRect(80, 80, 800, 800);
    return canvas.toDataURL('image/png');
  }, hueShift);
  const encoded = dataUrl.split(',')[1];
  if (!encoded) {
    throw new Error('Placeholder PNG data URL was empty');
  }
  return Buffer.from(encoded, 'base64');
}

async function interceptMockMedia(page: Page): Promise<void> {
  const placeholders = [
    await buildPlaceholderPng(page, 0),
    await buildPlaceholderPng(page, 18),
    await buildPlaceholderPng(page, 36),
    await buildPlaceholderPng(page, 54),
  ];

  const fulfillPlaceholder = async (
    route: Route,
    url: string,
  ): Promise<void> => {
    const index = Math.abs(hashString(url)) % placeholders.length;
    const body = placeholders[index];
    if (!body) {
      throw new Error('Placeholder PNG buffer missing');
    }
    await route.fulfill({
      body,
      contentType: contentTypeForUrl(url),
      headers: { 'Cache-Control': 'no-store' },
      status: 200,
    });
  };

  await page.route('**/_next/image**', async (route) => {
    await fulfillPlaceholder(route, route.request().url());
  });
  await page.route('**/cdn.genfeed.ai/**', async (route) => {
    await fulfillPlaceholder(route, route.request().url());
  });
}

function contentTypeForUrl(url: string): string {
  const pathname = url.split('?')[0] ?? url;
  if (pathname.endsWith('.mp4') || pathname.endsWith('.webm')) {
    return 'video/mp4';
  }
  if (pathname.endsWith('.mp3') || pathname.endsWith('.wav')) {
    return 'audio/mpeg';
  }
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  return 'image/png';
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return hash;
}

function isAppOriginApi(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
  } catch {
    return false;
  }
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status: 200,
  });
}

const README_USER = generateMockApiUser({
  email: '',
  firstName: 'Operator',
  handle: 'operator',
  lastName: 'Demo',
});

async function fulfillReadmeApi(route: Route, url: string): Promise<void> {
  if (url.includes('/auth/bootstrap')) {
    await fulfillJson(route, {
      access: {
        brandId: 'brand-1',
        creditsBalance: 1000,
        hasEverHadCredits: true,
        isOnboardingCompleted: true,
        isSuperAdmin: true,
        organizationId: 'mock-org-id-e2e-test',
        subscriptionStatus: 'active',
        subscriptionTier: 'pro',
        userId: 'mock-user-id-e2e-test',
      },
      brands: [generateMockBrand()],
      currentUser: README_USER,
      fleetCapabilities: { isByokEnabled: false, isFleetAvailable: false },
      settings: {
        defaultAvatarIngredientId: null,
        defaultVoiceId: null,
        defaultVoiceRef: null,
        id: 'org-settings-1',
        isAdvancedMode: false,
        isFleetNsfwVisible: false,
      },
      streak: null,
    });
    return;
  }

  if (/\/users\/me(?:\?|$)/.test(url)) {
    await fulfillJson(route, {
      data: {
        attributes: README_USER,
        id: 'mock-user-id-e2e-test',
        type: 'users',
      },
    });
    return;
  }

  if (
    url.includes('mine=true') ||
    url.includes('/organizations/mine') ||
    url.includes('/organizations?mine')
  ) {
    await fulfillJson(route, [
      {
        brand: { id: 'brand-1', label: 'Brand 1' },
        id: 'mock-org-id-e2e-test',
        isActive: true,
        isOwner: true,
        label: 'Demo Studio',
        slug: 'test-org',
      },
    ]);
    return;
  }

  if (url.includes('/organizations')) {
    await fulfillJson(route, {
      data: [
        {
          attributes: generateMockOrganization({
            id: 'mock-org-id-e2e-test',
            name: 'Demo Studio',
            slug: 'test-org',
          }),
          id: 'mock-org-id-e2e-test',
          type: 'organizations',
        },
      ],
      meta: { page: 1, pageSize: 1, totalCount: 1 },
    });
    return;
  }

  if (url.includes('/posts')) {
    await fulfillJson(route, {
      data: README_POSTS.map((post) => ({
        attributes: post,
        id: String(post.id),
        type: 'posts',
      })),
      meta: {
        page: 1,
        pageSize: README_POSTS.length,
        totalCount: README_POSTS.length,
      },
    });
    return;
  }

  if (/\/brands(?:\/[^/?]+)?(?:\?|$)/.test(url)) {
    await fulfillJson(route, {
      data: [
        {
          attributes: generateMockBrand(),
          id: 'brand-1',
          type: 'brands',
        },
      ],
      meta: { page: 1, pageSize: 1, totalCount: 1 },
    });
    return;
  }

  if (url.includes('/agent/threads')) {
    await fulfillJson(route, {
      data: [
        {
          attributes: {
            contextVersion: 1,
            createdAt: '2026-08-01T12:00:00.000Z',
            id: 'readme-thread-1',
            lastMessage: 'Draft a still for the weekly drop',
            messageCount: 2,
            status: 'active',
            title: 'Weekly studio drop',
            updatedAt: '2026-08-01T12:30:00.000Z',
          },
          id: 'readme-thread-1',
          type: 'threads',
        },
        {
          attributes: {
            contextVersion: 1,
            createdAt: '2026-08-02T09:00:00.000Z',
            id: 'readme-thread-2',
            lastMessage: 'Caption pass for the launch still',
            messageCount: 3,
            status: 'active',
            title: 'Launch captions',
            updatedAt: '2026-08-02T09:20:00.000Z',
          },
          id: 'readme-thread-2',
          type: 'threads',
        },
      ],
      meta: { page: 1, pageSize: 2, totalCount: 2 },
    });
    return;
  }

  if (url.includes('current/credits')) {
    await fulfillJson(route, {
      data: {
        credits: [{ balance: 1000, source: 'plan' }],
        planLimit: 1000,
        remainingPercent: 100,
        total: 1000,
      },
    });
    return;
  }

  if (url.includes('topbar-balances')) {
    await fulfillJson(route, {
      data: {
        attributes: {
          generatedAt: '2026-08-01T12:00:00.000Z',
          segments: [
            {
              balance: 1000,
              currencyOrUnit: 'credits',
              label: 'Genfeed',
              lastSyncedAt: '2026-08-01T12:00:00.000Z',
              provider: 'genfeed',
              status: 'available',
            },
          ],
        },
        id: 'topbar-balances',
        type: 'topbar-balances',
      },
    });
    return;
  }

  if (url.includes('/v1/images') || url.includes('/images?')) {
    await fulfillJson(route, {
      data: LIBRARY_IMAGES.map((image) => ({
        attributes: image,
        id: image.id,
        type: 'images',
      })),
      meta: {
        page: 1,
        pageSize: LIBRARY_IMAGES.length,
        totalCount: LIBRARY_IMAGES.length,
      },
    });
    return;
  }

  await fulfillJson(route, {
    data: [],
    meta: { page: 1, pageSize: 0, totalCount: 0 },
  });
}

async function interceptAppOriginApi(page: Page): Promise<void> {
  await page.route('**/agent/threads**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await fulfillReadmeApi(route, route.request().url());
  });

  await page.route(/\/v1\//, async (route) => {
    const url = route.request().url();
    if (/\/v1\/auth\/(get-session|token|jwks)/.test(url)) {
      await route.fallback();
      return;
    }
    if (
      isAppOriginApi(url) ||
      url.includes('genfeed.localhost') ||
      url.includes('api.genfeed.ai')
    ) {
      await fulfillReadmeApi(route, url);
      return;
    }
    await route.fallback();
  });

  await page.route('**/*credits*', async (route) => {
    await fulfillReadmeApi(route, route.request().url());
  });
}

async function installReadmeMocks(page: Page): Promise<void> {
  await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  await mockBrandsData(page, 2);
  await mockPostsList(page, README_POSTS);
  await mockWorkflowCrud(page, testWorkflows);
  await mockWorkflowTemplates(page, testWorkflowTemplates);
  await mockNodeTypes(page, testNodeTypes);
  await mockLibraryData(page);

  const fulfillLibraryImages = async (route: Route): Promise<void> => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      body: JSON.stringify({
        data: LIBRARY_IMAGES.map((image) => ({
          attributes: image,
          id: image.id,
          type: 'images',
        })),
        meta: {
          page: 1,
          pageSize: LIBRARY_IMAGES.length,
          totalCount: LIBRARY_IMAGES.length,
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  };

  await page.route('**/api.genfeed.ai/v1/images**', fulfillLibraryImages);
  await page.route('**/v1/images**', fulfillLibraryImages);

  await interceptAppOriginApi(page);

  await page.route('**/users/me**', async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace(/\/$/, '');
    if (route.request().method() !== 'GET' || !pathname.endsWith('/users/me')) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      body: JSON.stringify({
        data: {
          attributes: generateMockApiUser({
            email: '',
            firstName: 'Operator',
            handle: 'operator',
            lastName: 'Demo',
          }),
          id: 'mock-user-id-e2e-test',
          type: 'users',
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

async function redactSensitiveChrome(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      [data-testid="production-data-banner"],
      [data-nextjs-dialog],
      nextjs-portal,
      [data-sonner-toast],
      [data-sonner-toaster] { display: none !important; }
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  });

  await page.evaluate((emailPattern: string) => {
    const emailRe = new RegExp(emailPattern, 'i');
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    const hide: Element[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent ?? '';
      if (!emailRe.test(text)) {
        continue;
      }
      const element = node.parentElement;
      if (element) {
        hide.push(element);
      }
    }
    for (const element of hide) {
      (element as HTMLElement).style.visibility = 'hidden';
    }
    for (const node of Array.from(document.querySelectorAll('p, div, span'))) {
      const text = node.textContent?.trim() ?? '';
      if (
        /failed to load|could not be loaded|request failed/i.test(text) &&
        text.length < 120
      ) {
        (node as HTMLElement).style.visibility = 'hidden';
      }
    }
  }, EMAIL_RE.source);
}

async function assertFrameIsSafe(
  page: Page,
  targetPath: string,
): Promise<void> {
  expect(page.url(), `${targetPath} redirected to login`).not.toMatch(
    /\/login/,
  );
  await expect(
    page.getByRole('heading', { name: 'Something went wrong' }),
  ).toHaveCount(0);
  await expect(page.getByText('Internal Server Error')).toHaveCount(0);
  await expect(page.getByText(/Failed to load organiz/i)).toHaveCount(0);

  const visibleText = await page.locator('body').innerText();
  expect(visibleText, `${targetPath} still shows an email address`).not.toMatch(
    EMAIL_RE,
  );

  const failedRow = page
    .getByText(/generation failed|failed row|publish failed/i)
    .first();
  await expect(failedRow, `${targetPath} shows a failed-row state`).toHaveCount(
    0,
  );
}

async function captureFrame(
  page: Page,
  target: CaptureTarget,
): Promise<{ fileName: string; height: number; width: number }> {
  const response = await page.goto(target.path, {
    timeout: 120_000,
    waitUntil: 'domcontentloaded',
  });
  expect(
    response?.status() ?? 0,
    `${target.path} returned HTTP error`,
  ).toBeLessThan(400);

  await settle(page);

  if (target.readySelector) {
    await expect(page.locator(target.readySelector).first()).toBeVisible({
      timeout: 30_000,
    });
  } else {
    await expect(page.locator('body')).toBeVisible();
    const main = page
      .getByTestId('app-main-content')
      .or(page.locator('main'))
      .first();
    await expect(main).toBeVisible({ timeout: 30_000 });
  }

  if (target.prepare) {
    await target.prepare(page);
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const errorDialog = page
      .getByRole('dialog')
      .filter({ hasText: /Internal Server Error|Request failed/i });
    if (!(await errorDialog.isVisible().catch(() => false))) {
      break;
    }
    await errorDialog
      .getByRole('button')
      .first()
      .click()
      .catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
    await errorDialog
      .waitFor({ state: 'hidden', timeout: 2_000 })
      .catch(() => {});
  }

  await redactSensitiveChrome(page);
  await assertFrameIsSafe(page, target.path);

  const outputPath = path.join(README_ASSETS_DIR, target.fileName);
  await page.screenshot({
    animations: 'disabled',
    caret: 'hide',
    path: outputPath,
    scale: 'css',
    type: 'png',
  });

  return {
    fileName: target.fileName,
    height: VIEWPORT.height,
    width: VIEWPORT.width,
  };
}

test.describe.configure({ mode: 'serial' });

test('capture mocked README assets', async ({ page, context }) => {
  test.setTimeout(300_000);

  await page.setViewportSize(VIEWPORT);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('about:blank');
  await interceptMockMedia(page);
  await interceptAppOriginApi(page);

  await createAuthenticatedPage(
    page,
    context,
    {
      email: '',
      firstName: 'Operator',
      lastName: 'Demo',
      organizationName: 'Demo Studio',
    },
    orgPath('/workspace/overview'),
  );
  await installReadmeMocks(page);
  await mkdir(README_ASSETS_DIR, { recursive: true });

  const captured: Array<{ fileName: string; height: number; width: number }> =
    [];

  for (const target of CAPTURE_TARGETS) {
    captured.push(await captureFrame(page, target));
  }

  expect(captured.length, 'no README frames were captured').toBe(
    CAPTURE_TARGETS.length,
  );

  console.log(
    JSON.stringify(
      {
        directory: README_ASSETS_DIR,
        frames: captured,
        note: 'Mocked Playwright captures. Placeholder media, not live generations.',
      },
      null,
      2,
    ),
  );
});
