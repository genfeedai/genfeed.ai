import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_PLATFORM_FLAGS } from '@genfeedai/contracts/constants';
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
  buildUnhandledApiMockBody,
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
 * Writes PNGs from the mocked app-core shell.
 *
 * Two capture sets, picked with `CAPTURE_SET`:
 * - `readme` (default): README frames into docs/assets/readme/.
 *   Run: `bun run readme:capture`
 * - `website`: one frame per app surface into apps/website/public/products/,
 *   shown on the /products/<slug> marketing pages. Convert the PNGs to WebP
 *   with `bun run website:capture-products`.
 *
 * Not collected by CI e2e (lives outside playwright/e2e/tests/).
 */

const CAPTURE_SET =
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: not a turbo task
  process.env.CAPTURE_SET === 'website' ? 'website' : 'readme';

const README_ASSETS_DIR = path.resolve(
  process.cwd(),
  CAPTURE_SET === 'website'
    ? 'apps/website/public/products'
    : 'docs/assets/readme',
);

const CAPTURE_DEBUG_API =
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: not a turbo task
  process.env.CAPTURE_DEBUG_API === '1';

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

/**
 * One frame per app surface, named after its /products/<slug> page. The slugs
 * come from `apps/website/packages/data/app-products.data.ts`, so a surface
 * added there needs a target here.
 */
const WEBSITE_PRODUCT_TARGETS: CaptureTarget[] = [
  { fileName: 'playground.png', path: brandPath('/playground') },
  { fileName: 'storyboard.png', path: brandPath('/storyboard') },
  { fileName: 'clipper.png', path: brandPath('/clipper') },
  { fileName: 'motion.png', path: brandPath('/motion') },
  { fileName: 'turbo.png', path: brandPath('/turbo') },
  { fileName: 'editor.png', path: brandPath('/editor') },
  { fileName: 'publishing.png', path: brandPath('/publishing/overview') },
  {
    fileName: 'analytics.png',
    path: brandPath('/analytics/overview'),
    prepare: async (page: Page) => {
      const heading = page.getByText('Posts views by platform over time');
      await heading.scrollIntoViewIfNeeded().catch(() => {});
      await heading
        .evaluate((el) => el.scrollIntoView({ block: 'start' }))
        .catch(() => {});
      // Recharts draws its lines in; wait for the animation to finish.
      await page.waitForTimeout(3_000);
    },
  },
  { fileName: 'discovery.png', path: brandPath('/discovery/trends') },
  { fileName: 'messages.png', path: brandPath('/messages') },
  {
    fileName: 'agent.png',
    path: brandPath('/agent/readme-thread-2'),
    prepare: async (page: Page) => {
      // The mocked API has no realtime socket; hide its connection banner.
      await page.evaluate(() => {
        const hide = () => {
          for (const el of document.querySelectorAll('[role="status"]')) {
            if (
              /^(Offline|Connecting|Reconnecting)\./.test(
                el.textContent?.trim() ?? '',
              )
            ) {
              (el as HTMLElement).style.display = 'none';
            }
          }
        };
        hide();
        new MutationObserver(hide).observe(document.body, {
          childList: true,
          subtree: true,
        });
      });
      await page.waitForTimeout(500);
    },
  },
  { fileName: 'automation.png', path: brandPath('/automation/workflows') },
  { fileName: 'library.png', path: brandPath('/library/images') },
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

const MARKETING_POSTER_URLS = [
  'images',
  'reels',
  'ads',
  'articles',
  'avatars',
  'voice',
].map(
  (name) =>
    `https://cdn.genfeed.ai/assets/site/home/formats/${name}-poster.webp`,
);

async function loadMarketingPosters(page: Page): Promise<Buffer[]> {
  const posters: Buffer[] = [];
  for (const posterUrl of MARKETING_POSTER_URLS) {
    const response = await page.request
      .get(posterUrl, { timeout: 30_000 })
      .catch(() => null);
    if (response?.ok()) {
      posters.push(await response.body());
    }
  }
  return posters;
}

async function interceptMockMedia(page: Page): Promise<void> {
  const posters = await loadMarketingPosters(page);
  const placeholders =
    posters.length > 0
      ? posters
      : [
          await buildPlaceholderPng(page, 0),
          await buildPlaceholderPng(page, 18),
          await buildPlaceholderPng(page, 36),
          await buildPlaceholderPng(page, 54),
        ];
  const placeholderType = posters.length > 0 ? 'image/webp' : 'image/png';

  const fulfillPlaceholder = async (
    route: Route,
    url: string,
  ): Promise<void> => {
    const index = Math.abs(hashString(url)) % placeholders.length;
    const body = placeholders[index];
    if (!body) {
      throw new Error('Placeholder PNG buffer missing');
    }
    if (/\.(mp4|webm|mp3|wav)(\?|$)/.test(url)) {
      await route.abort();
      return;
    }
    await route.fulfill({
      body,
      contentType: placeholderType,
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
  await page.route('**/img.youtube.com/**', async (route) => {
    await fulfillPlaceholder(route, route.request().url());
  });
  await page.route('**/i.ytimg.com/**', async (route) => {
    await fulfillPlaceholder(route, route.request().url());
  });
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
      brands: [CAPTURE_BRAND],
      currentUser: README_USER,
      fleetCapabilities: { isByokEnabled: false, isFleetAvailable: false },
      settings: {
        defaultAvatarIngredientId: null,
        defaultVoiceId: null,
        defaultVoiceRef: null,
        hasOrganizationBilling: true,
        hasPaidModuleSubscription: true,
        id: 'org-settings-1',
        isFleetNsfwVisible: false,
        isReleasePreviewEnabled: true,
        moduleOverrides: {
          analytics: true,
          automation: true,
          clipper: true,
          discovery: true,
          editor: true,
          messages: true,
          motion: true,
          playground: true,
          publishing: true,
          storyboard: true,
          turbo: true,
        },
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
          attributes: CAPTURE_BRAND,
          id: 'brand-1',
          type: 'brands',
        },
      ],
      meta: { page: 1, pageSize: 1, totalCount: 1 },
    });
    return;
  }

  if (
    CAPTURE_SET === 'website' &&
    /\/agent\/threads\/[^/?]+\/messages/.test(url)
  ) {
    await fulfillJson(route, jsonApiCollection('messages', AGENT_MESSAGES));
    return;
  }

  if (
    CAPTURE_SET === 'website' &&
    /\/agent\/threads\/[^/?]+\/snapshot/.test(url)
  ) {
    await fulfillJson(route, {
      activeRun: null,
      lastAssistantMessage: null,
      lastSequence: 0,
      latestProposedPlan: null,
      latestUiBlocks: null,
      memorySummaryRefs: [],
      pendingApprovals: [],
      pendingInputRequests: [],
      profileSnapshot: null,
      sessionBinding: null,
      source: null,
      threadId: 'readme-thread-2',
      threadStatus: 'active',
      timeline: [],
      title: 'Launch captions',
    });
    return;
  }

  if (
    CAPTURE_SET === 'website' &&
    /\/agent\/threads\/[^/?]+\/work-objects/.test(url)
  ) {
    await fulfillJson(route, { sessionAssets: [], workObjects: [] });
    return;
  }

  if (CAPTURE_SET === 'website' && /\/agent\/transfers/.test(url)) {
    await fulfillJson(route, { data: [] });
    return;
  }

  if (
    CAPTURE_SET === 'website' &&
    /\/agent\/threads\/readme-thread-\d(?:\?|$)/.test(url)
  ) {
    await fulfillJson(route, {
      data: {
        attributes: {
          brandId: 'brand-1',
          contextVersion: 1,
          createdAt: '2026-10-26T09:00:00.000Z',
          id: 'readme-thread-2',
          lastMessage: AGENT_MESSAGES[1]?.content,
          messageCount: AGENT_MESSAGES.length,
          status: 'active',
          title: 'Launch captions',
          updatedAt: '2026-10-26T09:20:00.000Z',
        },
        id: 'readme-thread-2',
        type: 'threads',
      },
    });
    return;
  }

  if (url.includes('/agent/threads')) {
    await fulfillJson(route, {
      data: [
        {
          attributes: {
            brandId: 'brand-1',
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
            brandId: 'brand-1',
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

  if (await fulfillSurfaceApi(route, url)) {
    return;
  }

  if (CAPTURE_DEBUG_API) {
    process.stderr.write(`[unmocked] ${route.request().method()} ${url}\n`);
  }
  await fulfillJson(route, buildUnhandledApiMockBody(url));
}

function jsonApiCollection(
  type: string,
  items: Array<Record<string, unknown> & { id: string }>,
  { hasPagination = false }: { hasPagination?: boolean } = {},
): Record<string, unknown> {
  return {
    data: items.map((item) => ({ attributes: item, id: item.id, type })),
    // Paged lists read their footer total from the pagination links.
    ...(hasPagination
      ? { links: { pagination: { page: 1, pages: 1, total: items.length } } }
      : {}),
    meta: { page: 1, pageSize: items.length, totalCount: items.length },
  };
}

const CAPTURE_CDN = 'https://cdn.genfeed.ai/captures';

const AGENT_MESSAGES = [
  {
    content:
      'Write three caption options for the launch still, one per platform.',
    createdAt: '2026-10-26T09:00:00.000Z',
    id: 'agent-message-1',
    role: 'user',
    threadId: 'readme-thread-2',
  },
  {
    content:
      'Here are three options in your brand voice:\n\n**Instagram** — Built in the open, shipped on Friday. The new studio drop is live.\n\n**TikTok** — POV: your whole content week, generated before lunch.\n\n**YouTube Shorts** — One prompt, one still, one launch. Watch it come together.\n\nWant me to schedule them for the publishing desk?',
    createdAt: '2026-10-26T09:01:00.000Z',
    id: 'agent-message-2',
    role: 'assistant',
    threadId: 'readme-thread-2',
  },
];

const CLIPPER_PROJECTS = [
  {
    id: 'clip-1',
    name: 'Founder interview: building in public',
    progress: 100,
    readyClipCount: 8,
    sourceVideoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    status: 'completed',
  },
  {
    id: 'clip-2',
    name: 'Product launch keynote',
    pendingClipCount: 3,
    progress: 64,
    readyClipCount: 5,
    sourceVideoUrl: 'https://www.youtube.com/watch?v=9bZkp7q19f0',
    status: 'processing',
  },
  {
    id: 'clip-3',
    name: 'Podcast: AI video in 2026',
    progress: 100,
    readyClipCount: 12,
    sourceVideoUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    status: 'completed',
  },
  {
    id: 'clip-4',
    name: 'Weekly studio recap',
    progress: 100,
    readyClipCount: 6,
    sourceVideoUrl: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
    status: 'completed',
  },
];

const EDITOR_PROJECTS = [
  'Launch teaser cut',
  'Product walkthrough',
  'Behind the scenes reel',
  'Weekly recap',
].map((name, index) => ({
  createdAt: '2026-10-20T10:00:00.000Z',
  id: `editor-${index + 1}`,
  name,
  status: 'draft',
  thumbnailUrl: `${CAPTURE_CDN}/editor-${index + 1}.webp`,
  totalDurationFrames: 900 + index * 120,
  updatedAt: '2026-10-24T10:00:00.000Z',
}));

const TREND_TOPICS = [
  ['AI product demos', 94],
  ['Faceless storytelling', 88],
  ['Behind-the-scenes builds', 81],
  ['Day-in-the-life edits', 76],
  ['Before / after reveals', 72],
  ['One-take explainers', 67],
].map(([topic, score], index) => ({
  createdAt: '2026-10-25T08:00:00.000Z',
  expiresAt: '2026-11-25T08:00:00.000Z',
  growthRate: 40 - index * 4,
  id: `trend-${index + 1}`,
  isCurrent: true,
  mentions: 120000 - index * 9000,
  metadata: { growthMeasured: true, trendType: 'topic' as const },
  platform: index % 2 === 0 ? 'tiktok' : 'instagram',
  requiresAuth: false,
  topic,
  viralityScore: score,
}));

const TREND_VIDEOS = [
  'How we ship a week of content in one hour',
  'The 3-shot hook that doubled retention',
  'Inside our AI studio setup',
  'One prompt, five platforms',
  'Why short clips beat long edits',
  'Brand voice in 30 seconds',
].map((title, index) => ({
  commentCount: 320 - index * 20,
  creatorHandle: `@creator${index + 1}`,
  durationSeconds: 28 + index * 4,
  engagementRate: 9.2 - index * 0.6,
  hashtags: ['aivideo', 'contentstrategy', 'creators'],
  id: `video-${index + 1}`,
  likeCount: 48000 - index * 5000,
  outlierRatio: 6.4 - index * 0.5,
  platform: index % 2 === 0 ? 'tiktok' : 'youtube',
  publishedAt: '2026-10-22T12:00:00.000Z',
  shareCount: 2100 - index * 200,
  thumbnailUrl: `${CAPTURE_CDN}/trend-${index + 1}.webp`,
  title,
  velocity: 82 - index * 6,
  viewCount: 1200000 - index * 140000,
  viralScore: 92 - index * 5,
}));

const TREND_HASHTAGS = [
  'aivideo',
  'contentstrategy',
  'creatortools',
  'brandstorytelling',
  'shortformvideo',
  'behindthescenes',
].map((hashtag, index) => ({
  growthRate: 55 - index * 6,
  hashtag,
  id: `hashtag-${index + 1}`,
  isCurrent: true,
  platform: index % 2 === 0 ? 'tiktok' : 'instagram',
  postCount: 82000 - index * 9000,
  relatedHashtags: ['creators', 'marketing'],
  viewCount: 9400000 - index * 900000,
  viralityScore: 90 - index * 6,
}));

const TREND_SOUNDS = [
  'Midnight build',
  'Studio loop',
  'Soft launch',
  'Clean cut',
].map((soundName, index) => ({
  authorName: `Artist ${index + 1}`,
  growthRate: 48 - index * 7,
  id: `sound-${index + 1}`,
  isCurrent: true,
  platform: 'tiktok',
  soundId: `sound-${index + 1}`,
  soundName,
  usageCount: 64000 - index * 8000,
  viralityScore: 88 - index * 7,
}));

const CAPTURE_BRAND =
  CAPTURE_SET !== 'website'
    ? generateMockBrand()
    : generateMockBrand({
        credentials: [
          {
            handle: '@genfeed',
            id: 'cred-instagram',
            isConnected: true,
            label: 'Genfeed',
            platform: 'instagram',
            status: 'active',
          },
          {
            handle: '@genfeed',
            id: 'cred-tiktok',
            isConnected: true,
            label: 'Genfeed',
            platform: 'tiktok',
            status: 'active',
          },
          {
            handle: 'Genfeed',
            id: 'cred-youtube',
            isConnected: true,
            label: 'Genfeed',
            platform: 'youtube',
            status: 'active',
          },
        ] as never,
      });

const ANALYTICS_TOTALS = {
  activePlatforms: ['instagram', 'tiktok', 'youtube'],
  avgEngagementRate: 6.4,
  bestPerformingPlatform: 'tiktok',
  engagementGrowth: 12.4,
  monthlyGrowth: 18.2,
  totalComments: 3120,
  totalCredentialsConnected: 3,
  totalEngagement: 48200,
  totalLikes: 38400,
  totalPosts: 64,
  totalSaves: 4100,
  totalShares: 2580,
  totalViews: 892400,
  viewsGrowth: 24.8,
};

const ANALYTICS_TIMESERIES = Array.from({ length: 30 }, (_, index) => {
  const day = new Date(Date.UTC(2026, 9, index - 3));
  const wave = Math.round(Math.sin(index / 3) * 4000 + index * 900);
  const metrics = (views: number) => ({
    comments: Math.round(views * 0.004),
    likes: Math.round(views * 0.06),
    shares: Math.round(views * 0.003),
    views,
  });
  return {
    date: day.toISOString().slice(0, 10),
    instagram: metrics(9000 + wave),
    tiktok: metrics(14000 + wave * 1.4),
    youtube: metrics(6000 + wave * 0.6),
  };
});

const ANALYTICS_PLATFORMS = [
  ['tiktok', 412000, 24, 7.9],
  ['instagram', 301000, 26, 6.1],
  ['youtube', 179400, 14, 4.8],
].map(([platform, views, postCount, engagementRate]) => ({
  avgViewsPerPost: Math.round(Number(views) / Number(postCount)),
  comments: Math.round(Number(views) * 0.004),
  engagementRate,
  id: String(platform),
  likes: Math.round(Number(views) * 0.045),
  platform,
  postCount,
  saves: Math.round(Number(views) * 0.006),
  shares: Math.round(Number(views) * 0.003),
  totalEngagement: Math.round(Number(views) * 0.058),
  views,
}));

const ANALYTICS_TOP_POSTS = [
  ['Launch day recap', 'tiktok', 184000],
  ['Behind the scenes: studio setup', 'instagram', 142000],
  ['5 prompts that changed our workflow', 'youtube', 96000],
  ['Weekly drop teaser', 'instagram', 71000],
  ['Founder Q&A highlights', 'tiktok', 58000],
].map(([label, platform, totalViews], index) => ({
  brandName: 'Genfeed',
  description: String(label),
  engagementRate: 9.4 - index * 0.8,
  id: `top-post-${index}`,
  ingredientUrl: `${CAPTURE_CDN}/top-post-${index + 1}.webp`,
  isVideo: true,
  label: String(label),
  metricsStatus: 'collected',
  platform,
  postId: `post-${index + 1}`,
  thumbnailUrl: `${CAPTURE_CDN}/top-post-${index + 1}.webp`,
  totalComments: 420 - index * 60,
  totalEngagement: Math.round(Number(totalViews) * 0.07),
  totalLikes: Math.round(Number(totalViews) * 0.055),
  totalSaves: Math.round(Number(totalViews) * 0.006),
  totalShares: Math.round(Number(totalViews) * 0.004),
  totalViews,
}));

const ANALYTICS_TOP_ACCOUNTS = [
  ['cred-tiktok', 'tiktok', 412000],
  ['cred-instagram', 'instagram', 301000],
  ['cred-youtube', 'youtube', 179400],
].map(([credentialId, platform, totalViews]) => ({
  accountHandle: '@genfeed',
  accountLabel: 'Genfeed',
  credentialId,
  engagementRate: 7.2,
  id: String(credentialId),
  platform,
  totalEngagement: Math.round(Number(totalViews) * 0.058),
  totalPosts: 18,
  totalViews,
}));

const ACCOUNT_HEALTH = [
  ['cred-instagram', 'instagram', 94],
  ['cred-tiktok', 'tiktok', 88],
  ['cred-youtube', 'youtube', 97],
].map(([credentialId, platform, score]) => ({
  assessedAt: '2026-10-26T08:00:00.000Z',
  credentialId,
  handle: '@genfeed',
  holdPublishing: false,
  label: 'Genfeed',
  override: { isActive: false },
  platform,
  riskLevel: 'low',
  score,
  signals: {
    connectedDays: 240,
    profileSignals: 5,
    publishedPosts: 64,
    recentFailures: 0,
  },
  state: 'healthy',
  thresholds: {
    maxRecentFailures: 3,
    minConnectedDays: 14,
    minProfileSignals: 3,
    minPublishedPosts: 5,
  },
}));

const CONVERSATIONS = [
  [
    'instagram',
    'comment',
    'maya.creates',
    'Maya Torres',
    'Do you ship the storyboard export as a PDF too?',
    2,
  ],
  [
    'tiktok',
    'dm',
    'studio.lena',
    'Lena Park',
    'Loved the launch recap, can we collaborate on a clip series?',
    1,
  ],
  [
    'youtube',
    'comment',
    'northwind_ads',
    'Northwind Ads',
    'Which model did you use for the product shots?',
    1,
  ],
  [
    'instagram',
    'dm',
    'devon.builds',
    'Devon Reyes',
    'Is the weekly drop template shareable?',
    0,
  ],
  [
    'tiktok',
    'comment',
    'jules.film',
    'Jules Moreau',
    'That motion preset is incredible, where do I find it?',
    1,
  ],
  [
    'youtube',
    'comment',
    'kai_agency',
    'Kai Nakamura',
    'Can the agent schedule this across all three channels?',
    0,
  ],
].map(
  ([platform, conversationType, handle, name, text, unreadCount], index) => ({
    accountHandle: '@genfeed',
    accountName: 'Genfeed',
    automationState: index === 1 ? 'drafted' : 'manual',
    brandId: 'brand-1',
    conversationType,
    createdAt: '2026-10-25T09:00:00.000Z',
    credentialId: `cred-${platform}`,
    id: `conversation-${index + 1}`,
    inboundSequence: index + 1,
    latestMessageAt: `2026-10-26T0${7 - index}:15:00.000Z`,
    latestMessageText: text,
    needsReview: index === 1,
    participantAvatarUrl: `${CAPTURE_CDN}/avatar-${index + 1}.webp`,
    participantHandle: handle,
    participantName: name,
    platform,
    priority: 'normal',
    status: 'open',
    tags: [],
    unreadCount,
    updatedAt: '2026-10-26T08:00:00.000Z',
  }),
);

const CAPTURE_WORKFLOWS = [
  [
    'Social Media Pipeline',
    'Generate and publish social media content',
    'published',
    3,
  ],
  [
    'Weekly Drop Recap',
    "Turn the week's best clips into a recap reel",
    'published',
    5,
  ],
  [
    'Launch Teaser Series',
    'Storyboard, generate and schedule a teaser run',
    'draft',
    4,
  ],
  [
    'Trend Remix',
    'Pull a rising trend and remix it in brand voice',
    'published',
    6,
  ],
  [
    'Comment Reply Agent',
    'Draft on-brand replies for approval',
    'published',
    3,
  ],
  [
    'Product Shot Batch',
    'Batch product stills across aspect ratios',
    'draft',
    4,
  ],
].map(([name, description, status, nodeCount], index) => ({
  ...testWorkflows[0],
  createdAt: '2026-09-15T10:00:00Z',
  description,
  id: `workflow-${String(index + 1).padStart(3, '0')}`,
  isPublic: false,
  label: name,
  lastRunAt: '2026-10-25T14:30:00Z',
  name,
  nodeCount,
  runCount: 12 + index * 7,
  status,
  thumbnail: `${CAPTURE_CDN}/workflow-${index + 1}.webp`,
  updatedAt: '2026-10-25T14:30:00Z',
}));

const LIBRARY_GALLERY = Array.from({ length: 24 }, (_, index) => ({
  category: 'IMAGE',
  cdnUrl: `${CAPTURE_CDN}/library-${index + 1}.webp`,
  createdAt: `2026-10-${String(26 - (index % 20)).padStart(2, '0')}T10:00:00.000Z`,
  format: 'webp',
  height: index % 3 === 0 ? 1350 : 1080,
  id: `capture-image-${index + 1}`,
  ingredientUrl: `${CAPTURE_CDN}/library-${index + 1}.webp`,
  metadata: {
    height: index % 3 === 0 ? 1350 : 1080,
    label: ['Studio still', 'Product frame', 'Social frame', 'Launch hero'][
      index % 4
    ],
    width: 1080,
  },
  status: 'completed',
  thumbnailUrl: `${CAPTURE_CDN}/library-${index + 1}.webp`,
  url: `${CAPTURE_CDN}/library-${index + 1}.webp`,
  width: 1080,
}));

async function fulfillSurfaceApi(route: Route, url: string): Promise<boolean> {
  if (CAPTURE_SET !== 'website') {
    return false;
  }
  const pathname = new URL(url).pathname.replace(/\/$/, '');
  const method = route.request().method();

  if (method === 'GET' && /\/clipper-projects$/.test(pathname)) {
    await fulfillJson(
      route,
      jsonApiCollection('clipper-projects', CLIPPER_PROJECTS),
    );
    return true;
  }
  if (method === 'GET' && /\/editor-projects$/.test(pathname)) {
    await fulfillJson(
      route,
      jsonApiCollection('editor-projects', EDITOR_PROJECTS, {
        hasPagination: true,
      }),
    );
    return true;
  }
  if (method === 'GET' && /\/corpus\/health$/.test(pathname)) {
    await fulfillJson(route, {
      generatedAt: '2026-10-26T08:00:00.000Z',
      providerFailures: [],
      refreshHealth: ['tiktok', 'instagram', 'youtube'].map((platform) => ({
        completedAt: '2026-10-26T07:58:00.000Z',
        dataset: 'trends',
        lastAttemptAt: '2026-10-26T07:55:00.000Z',
        lastSuccessfulRefreshAt: '2026-10-26T07:58:00.000Z',
        outcome: 'native_available',
        platform,
        reason: null,
        scope: 'global',
      })),
      segments: ['tiktok', 'instagram', 'youtube'].map((platform) => ({
        id: `segment-${platform}`,
        latestSeenAt: '2026-10-26T07:58:00.000Z',
        platform,
        provider: 'native',
        status: 'healthy',
      })),
      status: 'healthy',
      summary: {
        activeTrends: 4200,
        failingProviders: 0,
        freshSegments: 3,
        platforms: ['tiktok', 'instagram', 'youtube'],
        referenceRecords: 4200,
        staleSegments: 0,
        totalSegments: 3,
      },
    });
    return true;
  }
  if (method === 'GET' && /\/trends\/discovery$/.test(pathname)) {
    await fulfillJson(route, {
      summary: {
        connectedPlatforms: ['tiktok', 'instagram', 'youtube'],
        lockedPlatforms: [],
        totalItems: 4200,
        totalTrends: TREND_TOPICS.length,
      },
      trends: TREND_TOPICS,
    });
    return true;
  }
  if (method === 'GET' && /\/trends\/videos$/.test(pathname)) {
    await fulfillJson(route, { videos: TREND_VIDEOS });
    return true;
  }
  if (method === 'GET' && /\/trends\/hashtags$/.test(pathname)) {
    await fulfillJson(route, { hashtags: TREND_HASHTAGS });
    return true;
  }
  if (method === 'GET' && /\/trends\/sounds$/.test(pathname)) {
    await fulfillJson(route, { sounds: TREND_SOUNDS });
    return true;
  }
  if (method === 'GET' && /\/trends\/corpus\/health$/.test(pathname)) {
    await fulfillJson(route, {
      generatedAt: '2026-10-25T08:00:00.000Z',
      providerFailures: [],
      refreshHealth: [],
      segments: [],
      status: 'healthy',
      summary: {
        activeTrends: TREND_TOPICS.length,
        failingProviders: 0,
        freshSegments: 3,
        platforms: ['tiktok', 'instagram', 'youtube'],
        referenceRecords: 4200,
        staleSegments: 0,
        totalSegments: 3,
      },
    });
    return true;
  }
  if (method === 'GET' && /\/brands\/[^/]+\/analytics$/.test(pathname)) {
    await fulfillJson(route, {
      data: {
        attributes: ANALYTICS_TOTALS,
        id: 'analytics-brand-1',
        type: 'analytics',
      },
    });
    return true;
  }
  if (method === 'GET' && /\/analytics$/.test(pathname)) {
    await fulfillJson(route, {
      data: {
        attributes: ANALYTICS_TOTALS,
        id: 'analytics-org',
        type: 'analytics',
      },
    });
    return true;
  }
  if (method === 'GET' && /\/analytics\/timeseries$/.test(pathname)) {
    await fulfillJson(
      route,
      jsonApiCollection('timeseries', ANALYTICS_TIMESERIES),
    );
    return true;
  }
  if (method === 'GET' && /\/analytics\/platforms$/.test(pathname)) {
    await fulfillJson(
      route,
      jsonApiCollection('platforms', ANALYTICS_PLATFORMS),
    );
    return true;
  }
  if (method === 'GET' && /\/analytics\/(accounts\/)?top$/.test(pathname)) {
    await fulfillJson(
      route,
      jsonApiCollection(
        'top-posts',
        /accounts\/top/.test(pathname)
          ? ANALYTICS_TOP_ACCOUNTS
          : ANALYTICS_TOP_POSTS,
      ),
    );
    return true;
  }
  if (
    method === 'GET' &&
    /\/credentials\/brand\/[^/]+\/account-health$/.test(pathname)
  ) {
    await fulfillJson(route, ACCOUNT_HEALTH);
    return true;
  }
  if (method === 'GET' && /\/messages\/unread-count$/.test(pathname)) {
    await fulfillJson(route, {
      data: {
        attributes: { unreadCount: 5 },
        id: 'unread-count',
        type: 'unread-count',
      },
    });
    return true;
  }
  if (method === 'GET' && /\/messages\/[^/]+\/messages$/.test(pathname)) {
    const conversationId = pathname.split('/').slice(-2, -1)[0];
    const conversation =
      CONVERSATIONS.find((item) => item.id === conversationId) ??
      CONVERSATIONS[0];
    await fulfillJson(
      route,
      jsonApiCollection('social-messages', [
        {
          authorRole: 'participant',
          body: conversation.latestMessageText,
          conversationId: conversation.id,
          createdAt: '2026-10-26T07:15:00.000Z',
          direction: 'inbound',
          id: `${conversation.id}-message-1`,
          messageType: conversation.conversationType,
          platform: conversation.platform,
          senderAvatarUrl: conversation.participantAvatarUrl,
          senderHandle: conversation.participantHandle,
          senderName: conversation.participantName,
          status: 'received',
          updatedAt: '2026-10-26T07:15:00.000Z',
        },
        {
          authorRole: 'participant',
          body: 'Also, can I get the editable template? Happy to wait until Friday.',
          conversationId: conversation.id,
          createdAt: '2026-10-26T07:40:00.000Z',
          direction: 'inbound',
          id: `${conversation.id}-message-2`,
          messageType: conversation.conversationType,
          platform: conversation.platform,
          senderAvatarUrl: conversation.participantAvatarUrl,
          senderHandle: conversation.participantHandle,
          senderName: conversation.participantName,
          status: 'received',
          updatedAt: '2026-10-26T07:40:00.000Z',
        },
      ]),
    );
    return true;
  }
  if (method === 'PATCH' && /\/messages\/[^/]+\/read$/.test(pathname)) {
    const conversationId = pathname.split('/').slice(-2, -1)[0];
    const conversation =
      CONVERSATIONS.find((item) => item.id === conversationId) ??
      CONVERSATIONS[0];
    await fulfillJson(route, {
      data: {
        attributes: { ...conversation, unreadCount: 0 },
        id: conversation.id,
        type: 'social-conversations',
      },
    });
    return true;
  }
  if (method === 'GET' && /\/messages$/.test(pathname)) {
    await fulfillJson(
      route,
      jsonApiCollection('social-conversations', CONVERSATIONS),
    );
    return true;
  }
  if (method === 'GET' && /\/post-groups$/.test(pathname)) {
    const params = new URL(url).searchParams;
    const nowMs = Date.now();
    const HOUR_MS = 60 * 60 * 1000;
    const buildRelease = (
      id: string,
      title: string,
      platform: string,
      offsetHours: number,
      executionState: 'published' | 'scheduled',
    ) => {
      const at = new Date(nowMs + offsetHours * HOUR_MS).toISOString();
      return {
        baseContent: title,
        brandId: 'brand-1',
        createdAt: '2026-10-24T09:00:00.000Z',
        id,
        publishedAt: executionState === 'published' ? at : undefined,
        scheduledAt: at,
        status: executionState,
        targetSummary: { total: 1 },
        targets: [
          {
            credential: {
              id: `cred-${platform}`,
              label: 'Genfeed',
              platform,
            },
            credentialId: `cred-${platform}`,
            executionState,
            id: `${id}-target`,
            platform,
            publishedAt: executionState === 'published' ? at : undefined,
            releaseId: id,
            scheduledAt: at,
          },
        ],
        timezone: 'UTC',
        title,
        updatedAt: at,
      };
    };
    let releases: ReturnType<typeof buildRelease>[] = [];
    if (params.getAll('executionState').includes('scheduled')) {
      releases = [
        ['Launch teaser, cut 2', 'instagram', 1],
        ['Weekly drop recap', 'tiktok', 2],
        ['Behind the scenes: storyboard pass', 'youtube', 5],
        ['Product reveal reel', 'instagram', 9],
        ['Creator spotlight', 'tiktok', 14],
        ['Trend remix, take 3', 'youtube', 20],
      ].map(([title, platform, offset], index) =>
        buildRelease(
          `release-scheduled-${index + 1}`,
          String(title),
          String(platform),
          Number(offset),
          'scheduled',
        ),
      );
    } else if (params.get('publicationState') === 'posted') {
      releases = [
        ['Studio walkthrough', 'instagram', -20],
        ['Launch recap', 'tiktok', -44],
        ['Model comparison short', 'youtube', -70],
        ['Weekly drop #41', 'instagram', -96],
      ].map(([title, platform, offset], index) =>
        buildRelease(
          `release-posted-${index + 1}`,
          String(title),
          String(platform),
          Number(offset),
          'published',
        ),
      );
    }
    await fulfillJson(route, {
      data: releases.map((release) => ({
        attributes: release,
        id: release.id,
        type: 'post-groups',
      })),
      links: {
        pagination: {
          limit: 100,
          page: 1,
          pages: 1,
          total: releases.length,
        },
      },
      meta: { page: 1, pageSize: 100, totalCount: releases.length },
    });
    return true;
  }
  if (method === 'GET' && /\/workflows\/most-used$/.test(pathname)) {
    await fulfillJson(
      route,
      jsonApiCollection(
        'workflows',
        CAPTURE_WORKFLOWS.map((workflow, index) => ({
          ...workflow,
          executionCount: 48 - index * 7,
          lastExecutedAt: `2026-10-${String(26 - index).padStart(2, '0')}T08:00:00.000Z`,
        })),
      ),
    );
    return true;
  }
  if (method === 'GET' && /\/workflows$/.test(pathname)) {
    await fulfillJson(route, {
      data: CAPTURE_WORKFLOWS.map((workflow) => ({
        attributes: workflow,
        id: workflow.id,
        type: 'workflows',
      })),
      links: {
        pagination: {
          limit: 12,
          page: 1,
          pages: 1,
          total: CAPTURE_WORKFLOWS.length,
        },
      },
      meta: {
        page: 1,
        pageSize: 12,
        totalCount: CAPTURE_WORKFLOWS.length,
      },
    });
    return true;
  }
  if (method === 'GET' && /\/(images|ingredients)$/.test(pathname)) {
    await fulfillJson(route, jsonApiCollection('images', LIBRARY_GALLERY));
    return true;
  }
  return false;
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
    if (/\/v1\/public\/platform-flags/.test(url)) {
      await fulfillJson(route, DEFAULT_PLATFORM_FLAGS);
      return;
    }
    if (/\/v1\/auth\/(get-session|token|jwks)/.test(url)) {
      await route.fallback();
      return;
    }
    if (/\/v1\/(ingredients|workflows)(?:[/?]|$)/.test(url)) {
      if (CAPTURE_SET === 'website' && (await fulfillSurfaceApi(route, url))) {
        return;
      }
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
  const targets =
    CAPTURE_SET === 'website' ? WEBSITE_PRODUCT_TARGETS : CAPTURE_TARGETS;

  const failures: string[] = [];
  for (const target of targets) {
    if (CAPTURE_DEBUG_API) {
      process.stderr.write(`[target] ${target.fileName}\n`);
    }
    try {
      captured.push(await captureFrame(page, target));
    } catch (error) {
      failures.push(`${target.fileName}: ${String(error).slice(0, 300)}`);
    }
  }
  expect(failures, 'frames failed to capture').toEqual([]);

  expect(captured.length, 'no frames were captured').toBe(targets.length);

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
