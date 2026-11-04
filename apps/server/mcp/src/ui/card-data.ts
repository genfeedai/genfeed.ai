import { createHash } from 'node:crypto';
import type { McpToolOutput } from '@genfeedai/actions';
import {
  SATOSHI_FONT_RESOURCE_PATH,
  staticSurfaceFontCss,
} from '@genfeedai/ui/static/font';
import type {
  McpAppResult,
  McpCalendarDay,
  McpCard,
  McpCardFact,
  McpCardKind,
  McpCardLayout,
  McpCardMetric,
  McpCardView,
  McpMediaKind,
} from '@mcp/shared/interfaces/mcp-app.interface';
import preview from '@mcp/ui/preview-client.tsx?mcp-preview';

// Shared components/styles also change the resource; never reuse a cached view.
export const MCP_CARD_RESOURCE_HASH = createHash('sha256')
  .update(preview.script)
  .update(preview.css)
  .update(staticSurfaceFontCss)
  .update(SATOSHI_FONT_RESOURCE_PATH)
  .digest('hex')
  .slice(0, 12);
const MCP_CARD_RESOURCE_URI_PREFIX = 'ui://genfeed/content-cards-v5-';
export const MCP_CARD_RESOURCE_URI = `${MCP_CARD_RESOURCE_URI_PREFIX}${MCP_CARD_RESOURCE_HASH}.html`;
const MCP_CARD_RESOURCE_URI_PATTERN = new RegExp(
  `^${MCP_CARD_RESOURCE_URI_PREFIX}[0-9a-f]{12}\\.html$`,
);

/**
 * The card view of any build. The hash changes with every deploy, but hosts
 * (ChatGPT in particular) keep reading the URI from a tool list they cached
 * earlier. Every build serves the current view for those URIs rather than
 * failing the widget with an error.
 */
export function isContentCardsUri(uri: unknown): uri is string {
  return typeof uri === 'string' && MCP_CARD_RESOURCE_URI_PATTERN.test(uri);
}
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';

/** Statuses of a media job that has not produced its output yet. */
const PENDING_STATUSES = new Set([
  'generating',
  'in_progress',
  'pending',
  'processing',
  'queued',
  'running',
  'started',
]);

const CALENDAR_MAX_DAYS = 31;

const TOOL_KINDS: Readonly<Record<string, McpCardKind>> = {
  control_scheduled_release: 'summary',
  create_post: 'post',
  create_scheduled_release: 'summary',
  generate: 'media',
  // Social copy renders as a post; an article result switches to the article
  // card in buildCardView via its articleId.
  generate_content: 'post',
  get_account: 'summary',
  get_articles: 'article',
  check_channel: 'summary',
  get_brand_publishing_readiness: 'summary',
  get_brands: 'summary',
  get_job_status: 'media',
  get_posts: 'post',
  get_scheduled_release: 'summary',
  get_assets: 'media',
  get_orgs: 'summary',
  get_scheduler_capabilities: 'summary',
  switch_org: 'summary',
  transform_media: 'media',
  update_scheduled_release: 'summary',
  validate_scheduler_target: 'summary',
};

/** Short host status lines shown while a tool runs and once it returns. */
const INVOCATION_STATUS: Readonly<
  Record<McpCardKind, { invoked: string; invoking: string }>
> = {
  article: { invoked: 'Article ready', invoking: 'Loading articles…' },
  audio: { invoked: 'Audio ready', invoking: 'Preparing audio…' },
  image: { invoked: 'Image ready', invoking: 'Preparing image…' },
  media: { invoked: 'Media ready', invoking: 'Working on media…' },
  post: { invoked: 'Posts ready', invoking: 'Loading posts…' },
  summary: { invoked: 'Summary ready', invoking: 'Loading summary…' },
  video: { invoked: 'Video ready', invoking: 'Preparing video…' },
};

/**
 * Links a tool to the content-card view. `ui.resourceUri` is the MCP Apps
 * key; the flat `ui/resourceUri` is the legacy spelling older hosts read, and
 * `openai/outputTemplate` is the ChatGPT alias. Text `content` stays the
 * fallback for hosts that render no UI.
 */
export function withCardMetadata(tool: McpToolOutput): McpToolOutput {
  if (!TOOL_KINDS[tool.name] && tool.name !== 'resolve_approval') return tool;
  const status = INVOCATION_STATUS[TOOL_KINDS[tool.name] ?? 'post'];
  return {
    ...tool,
    _meta: {
      ...tool._meta,
      'openai/outputTemplate': MCP_CARD_RESOURCE_URI,
      'openai/toolInvocation/invoked': status.invoked,
      'openai/toolInvocation/invoking': status.invoking,
      ui: { resourceUri: MCP_CARD_RESOURCE_URI },
      'ui/resourceUri': MCP_CARD_RESOURCE_URI,
    },
  };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function safeCardUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function cardKind(
  row: Record<string, unknown>,
  fallback: McpCardKind,
): McpCardKind {
  const kind = text(row, 'kind', 'assetKind', 'category').toLowerCase();
  if (kind === 'image' || kind === 'video' || kind === 'audio') return kind;
  if (kind === 'music' || kind === 'voice') return 'audio';
  if (kind === 'avatar') return 'image';
  return fallback;
}

function mediaKind(row: Record<string, unknown>): McpMediaKind | undefined {
  const kind = cardKind(row, 'media');
  return kind === 'image' || kind === 'video' || kind === 'audio'
    ? kind
    : undefined;
}

/**
 * Listed posts carry `media: [{ assetId, kind, order }]` without URLs, so the
 * preview shows what is attached; a media item that does carry a URL plays.
 */
function postMedia(row: Record<string, unknown>): Partial<McpCard> {
  if (!Array.isArray(row.media)) return {};
  const items = row.media.slice(0, 10).map(record);
  const attachments = items.flatMap((item) => {
    const kind = mediaKind(item);
    return kind ? [kind] : [];
  });
  const media = items.flatMap((item, index) => {
    const kind = mediaKind(item);
    return kind
      ? [
          {
            id: text(item, 'assetId', 'id') || `media-${index}`,
            kind,
            url: safeCardUrl(text(item, 'url', 'cdnUrl')),
            thumbnailUrl: safeCardUrl(text(item, 'thumbnailUrl')),
          },
        ]
      : [];
  });
  const playable = items.find(
    (item) => mediaKind(item) && safeCardUrl(text(item, 'url', 'cdnUrl')),
  );
  return {
    ...(attachments.length ? { attachments, media } : {}),
    ...(playable
      ? {
          mediaKind: mediaKind(playable),
          mediaUrl: safeCardUrl(text(playable, 'url', 'cdnUrl')),
        }
      : {}),
  };
}

function postAuthor(row: Record<string, unknown>): Partial<McpCard> {
  const author = record(row.author);
  const name = text(author, 'name');
  const handle = text(author, 'handle');
  const avatarUrl = safeCardUrl(text(author, 'avatarUrl'));
  return name || handle || avatarUrl
    ? { author: { name, handle, avatarUrl } }
    : {};
}

function progress(row: Record<string, unknown>): number | undefined {
  const value = row.progress ?? row.generationProgress;
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : undefined;
}

function card(row: Record<string, unknown>, kind: McpCardKind): McpCard {
  const status = text(row, 'status', 'state', 'executionState');
  const url = safeCardUrl(text(row, 'url', 'cdnUrl', 'publishedUrl'));
  const resolvedKind = cardKind(row, kind);
  const isMedia = ['audio', 'image', 'media', 'video'].includes(resolvedKind);
  const isPending =
    isMedia && !url && PENDING_STATUSES.has(status.toLowerCase());
  const stage = text(row, 'stage', 'generationStage');
  return {
    ...(resolvedKind === 'post'
      ? { ...postMedia(row), ...postAuthor(row) }
      : {}),
    ...(isPending ? { isPending, progress: progress(row) } : {}),
    ...(isPending && stage ? { stage } : {}),
    date: text(row, 'scheduledDate', 'scheduledAt', 'publishedAt', 'createdAt'),
    description: text(
      row,
      'description',
      'excerpt',
      'content',
      'prompt',
      'text',
      'message',
    ).slice(0, 4000),
    id: text(
      row,
      'id',
      'assetId',
      'articleId',
      'ingredientId',
      'postId',
      'jobId',
    ),
    kind: resolvedKind,
    platform: text(row, 'platform'),
    status,
    thumbnailUrl: safeCardUrl(
      text(row, 'thumbnailUrl', 'thumbnail', 'posterUrl'),
    ),
    title: (
      text(row, 'title', 'label', 'name') ||
      `${resolvedKind.charAt(0).toUpperCase()}${resolvedKind.slice(1)}`
    ).slice(0, 240),
    url,
  };
}

function isoDay(value: unknown): string | undefined {
  if (typeof value !== 'string' && !(value instanceof Date)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? undefined
    : date.toISOString().slice(0, 10);
}

/**
 * `get_posts {days}` returns `scheduled` posts and `gapDays` for the coming
 * days. Every day in the window becomes a column: its posts, or a gap.
 */
function buildCalendarView(data: Record<string, unknown>): McpCardView {
  const scheduled = Array.isArray(data.scheduled) ? data.scheduled : [];
  const gapDays = new Set(
    (Array.isArray(data.gapDays) ? data.gapDays : []).flatMap((value) => {
      const day = isoDay(value);
      return day ? [day] : [];
    }),
  );
  const postsByDay = new Map<string, McpCard[]>();
  for (const value of scheduled.slice(0, 200)) {
    const row = record(value);
    const day = isoDay(row.scheduledDate);
    if (!day) continue;
    const post = card(row, 'post');
    postsByDay.set(day, [...(postsByDay.get(day) ?? []), post]);
  }
  const days: McpCalendarDay[] = [
    ...new Set([...gapDays, ...postsByDay.keys()]),
  ]
    .sort()
    .slice(0, CALENDAR_MAX_DAYS)
    .map((date) => {
      const posts = (postsByDay.get(date) ?? []).sort((a, b) =>
        a.date.localeCompare(b.date),
      );
      return { date, isGap: posts.length === 0, posts };
    });
  const draftsCount =
    typeof data.draftsCount === 'number' && Number.isFinite(data.draftsCount)
      ? data.draftsCount
      : 0;
  return {
    calendar: { days, draftsCount },
    cards: days.flatMap((day) => day.posts),
    layout: 'calendar',
    title: 'Content calendar',
    total: scheduled.length,
  };
}

const VIEW_TITLES: Readonly<Record<string, string>> = {
  create_post: 'Draft post',
  generate: 'Generation',
  generate_content: 'Generated content',
  get_articles: 'Articles',
  get_assets: 'Library',
  get_job_status: 'Generation',
  get_posts: 'Posts',
  transform_media: 'Media',
};

function layoutFor(kind: McpCardKind): McpCardLayout {
  if (kind === 'post') return 'posts';
  if (kind === 'article' || kind === 'summary') return 'cards';
  return 'media';
}

/** Credits and usage: two decimals at most, grouped by thousands. */
export function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(
    value,
  );
}

function fact(label: string, value: unknown): McpCardFact[] {
  const shown =
    typeof value === 'number' && Number.isFinite(value)
      ? formatAmount(value)
      : typeof value === 'string'
        ? value.trim()
        : '';
  return shown ? [{ label, value: shown }] : [];
}

function words(value: string): string {
  const spaced = value.replace(/[_-]/g, ' ').toLowerCase();
  return `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`;
}

function summaryCard(
  title: string,
  facts: McpCardFact[],
  extra: Partial<McpCard> = {},
): McpCard {
  return {
    date: '',
    description: '',
    id: '',
    kind: 'summary',
    platform: '',
    status: '',
    title,
    ...extra,
    facts,
  };
}

function metric(
  label: string,
  value: unknown,
  extra: Partial<McpCardMetric> = {},
): McpCardMetric[] {
  return typeof value === 'number' && Number.isFinite(value)
    ? [{ label, value: formatAmount(value), ...extra }]
    : [];
}

/**
 * `get_account`: who is connected and what is left to spend, as people name
 * things. Identifiers stay in the structured data for the agent.
 */
function buildAccountView(data: Record<string, unknown>): McpCardView {
  const profile = record(data.profile);
  const credits = record(data.credits);
  const usage = record(data.usage);
  const cards: McpCard[] = [];
  if (Object.keys(profile).length) {
    const brandCount =
      typeof profile.brandCount === 'number' ? profile.brandCount : undefined;
    const brandNames = (Array.isArray(profile.brands) ? profile.brands : [])
      .map((brand) => text(record(brand), 'name'))
      .filter(Boolean);
    const brandsFact: McpCardFact[] =
      brandCount === 0
        ? fact('Brands', 'None yet. Create one in Genfeed to generate.')
        : brandCount !== undefined
          ? [
              {
                ...(brandNames.length
                  ? { items: brandNames.map((label) => ({ label })) }
                  : {}),
                label: 'Brands',
                value: brandNames.join(', ') || String(brandCount),
              },
            ]
          : [];
    cards.push(
      summaryCard(
        text(profile, 'organizationName') || 'Genfeed account',
        [
          ...fact('Active brand', text(profile, 'brandName')),
          ...brandsFact,
          ...(typeof profile.isOnboardingCompleted === 'boolean'
            ? [
                {
                  label: 'Account setup',
                  status: profile.isOnboardingCompleted
                    ? 'completed'
                    : 'needs_attention',
                  value: profile.isOnboardingCompleted
                    ? 'Complete'
                    : 'Incomplete',
                },
              ]
            : []),
        ],
        {
          hasAvatar: true,
          id: text(profile, 'organizationId'),
          status: words(text(profile, 'role')),
        },
      ),
    );
  }
  const balance = credits.balance ?? usage.currentBalance;
  const trend =
    typeof usage.trendPercentage === 'number' &&
    Number.isFinite(usage.trendPercentage)
      ? {
          direction:
            usage.trendPercentage > 0
              ? ('up' as const)
              : usage.trendPercentage < 0
                ? ('down' as const)
                : ('flat' as const),
          label: `${formatAmount(Math.abs(usage.trendPercentage))}%`,
        }
      : undefined;
  const metrics: McpCardMetric[] = [
    ...metric('Available', balance),
    ...metric('Used in 7 days', usage.usage7Days, { trend }),
    ...metric('Used in 30 days', usage.usage30Days),
  ].map((item, index) => ({ ...item, isPrimary: index === 0 }));
  if (metrics.length) {
    cards.push(summaryCard('Credits', [], { metrics }));
  }
  return {
    cards,
    isCountHidden: true,
    layout: 'cards',
    title: 'Genfeed account',
    total: cards.length,
  };
}

/** The brand's logo URL, when the API signed one for this caller. */
function brandLogoUrl(row: Record<string, unknown>): string | undefined {
  return safeCardUrl(text(record(row.logo), 'cdnUrl'));
}

/** One brand: logo, handle, ACTIVE badge, description and a Select button. */
function brandCard(row: Record<string, unknown>): McpCard {
  const id = text(row, 'id');
  return summaryCard(
    text(row, 'label', 'name') || 'Brand',
    [...fact('Handle', text(row, 'slug'))],
    {
      ...(id
        ? { actions: [{ brandId: id, kind: 'select_brand', label: 'Select' }] }
        : {}),
      avatarUrl: brandLogoUrl(row),
      description: text(row, 'description', 'text').slice(0, 400),
      hasAvatar: true,
      id,
      status: row.isActive === true ? 'Active' : '',
    },
  );
}

/**
 * `get_brands`: one card per brand, with its logo, its own description and a
 * Select button that tells the host which brand the conversation works with.
 */
function buildBrandsView(data: Record<string, unknown>): McpCardView {
  const rows = Array.isArray(data.brands)
    ? data.brands
    : data.brand
      ? [data.brand]
      : [];
  const cards = rows.slice(0, 24).map((value) => brandCard(record(value)));
  return {
    cards,
    layout: 'cards',
    title: 'Brands',
    total: rows.length,
  };
}

/**
 * Signed logo URLs belong to the card, not to the model: they are long and
 * expire. The card view is built first, then the logos leave the data.
 */
export function withoutBrandLogos(data: Record<string, unknown>) {
  const strip = (value: unknown) => {
    const { logo: _logo, ...rest } = record(value);
    return rest;
  };
  return {
    ...data,
    ...(Array.isArray(data.brands) ? { brands: data.brands.map(strip) } : {}),
    ...(data.brand ? { brand: strip(data.brand) } : {}),
  };
}

/**
 * `get_orgs` / `switch_org`: the organization dropdown plus the brands of the
 * organization the connection works inside. Identifiers stay in the
 * structured data; the card shows names.
 */
function buildOrganizationsView(data: Record<string, unknown>): McpCardView {
  const activeId = text(data, 'activeOrganizationId');
  const choices = (Array.isArray(data.organizations) ? data.organizations : [])
    .slice(0, 50)
    .map((value) => {
      const row = record(value);
      const id = text(row, 'id');
      return {
        id,
        isActive: id === activeId || (!activeId && row.isActive === true),
        label: text(row, 'label', 'name') || 'Organization',
      };
    })
    .filter((choice) => choice.id);
  const brands = (Array.isArray(data.brands) ? data.brands : [])
    .slice(0, 24)
    .map((value) => brandCard(record(value)));
  return {
    cards: brands,
    layout: 'organizations',
    organizations: {
      activeId: choices.find((choice) => choice.isActive)?.id ?? '',
      canSwitch: data.canSwitchOrganizations === true && choices.length > 1,
      choices,
    },
    title: 'Workspace',
    total: brands.length,
  };
}

const CHANNEL_LABELS: Readonly<Record<string, string>> = {
  discord: 'Discord',
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  reddit: 'Reddit',
  telegram: 'Telegram',
  threads: 'Threads',
  tiktok: 'TikTok',
  twitch: 'Twitch',
  twitter: 'X',
  x: 'X',
  youtube: 'YouTube',
};

/** A channel's display name: the API's own label, else a known brand spelling. */
function channelLabel(platform: string, label = ''): string {
  return (
    label ||
    CHANNEL_LABELS[platform.toLowerCase()] ||
    words(platform) ||
    'Channel'
  );
}

/** A readiness check as a status badge: tone from the result, wording its own. */
function checkFact(label: string, result: unknown): McpCardFact[] {
  const status = typeof result === 'string' ? result.toLowerCase() : '';
  if (status === 'pass') {
    return [{ label, status: 'completed', value: 'Passed' }];
  }
  if (status === 'warn') {
    return [{ label, status: 'needs_attention', value: 'Warning' }];
  }
  if (status === 'fail') {
    return [{ label, status: 'failed', value: 'Failed' }];
  }
  return [{ label, status: 'unknown', value: 'Unknown' }];
}

const READINESS_LABELS: Readonly<Record<string, string>> = {
  blocked: 'Blocked',
  degraded: 'Degraded',
  publish_capable: 'Ready',
  unknown: 'Unknown',
};

function utcStamp(value: string): string {
  const time = Date.parse(value);
  return Number.isNaN(time)
    ? ''
    : `${new Date(time).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function rows(value: unknown): Record<string, unknown>[] {
  return (Array.isArray(value) ? value : []).map(record);
}

/** One connected channel: can it publish, and which checks hold it back. */
function readinessCard(row: Record<string, unknown>): McpCard {
  const diagnostics = rows(row.diagnostics);
  const lead =
    diagnostics.find((item) => text(item, 'severity') === 'error') ??
    diagnostics.find((item) => text(item, 'severity') === 'warning') ??
    diagnostics[0];
  const providerKey = text(row, 'providerKey');
  return summaryCard(
    channelLabel(providerKey),
    [
      ...(typeof row.canSchedule === 'boolean'
        ? [
            {
              label: 'Scheduling',
              status: row.canSchedule ? 'completed' : 'blocked',
              value: row.canSchedule ? 'Allowed' : 'Blocked',
            },
          ]
        : []),
      ...checkFact('Access token', row.tokenFreshness),
      ...checkFact('Permissions', row.permissionScopeStatus),
      ...checkFact('Callback URL', row.callbackUrlStatus),
      ...checkFact('App review', row.appReviewStatus),
      ...checkFact('Quota', row.quotaStatus),
      ...fact(
        'Last successful check',
        utcStamp(text(row, 'lastSuccessfulValidationAt')),
      ),
    ],
    {
      description:
        text(row, 'requiredAction') ||
        (lead ? text(lead, 'correctiveAction', 'message') : ''),
      id: text(row, 'credentialId') || providerKey,
      platform: providerKey,
      status: text(row, 'state') || 'unknown',
    },
  );
}

/** `get_brand_publishing_readiness`: one card per connected channel. */
function buildReadinessView(payload: unknown): McpCardView {
  const channels = rows(
    Array.isArray(payload) ? payload : record(payload).data,
  );
  return {
    cards: channels.slice(0, 24).map(readinessCard),
    layout: 'cards',
    title: 'Publishing readiness',
    total: channels.length,
  };
}

/** What one channel accepts: modes, caption length and media kinds. */
function capabilityCard(row: Record<string, unknown>): McpCard {
  const platform = text(row, 'platform');
  const modes = (Array.isArray(row.publishModes) ? row.publishModes : [])
    .filter((mode): mode is string => typeof mode === 'string')
    .map(words);
  const kinds = (
    Array.isArray(record(row.media).kinds)
      ? (record(row.media).kinds as unknown[])
      : []
  )
    .filter((kind): kind is string => typeof kind === 'string')
    .map(words);
  const maxLength = record(row.caption).maxLength;
  return summaryCard(
    channelLabel(platform, text(row, 'label')),
    [
      ...fact('Publish modes', modes.join(', ')),
      ...fact(
        'Caption limit',
        typeof maxLength === 'number' ? `${maxLength} characters` : '',
      ),
      ...fact('Media', kinds.join(', ')),
    ],
    {
      description: text(row, 'description'),
      id: platform,
      platform,
      status: text(row, 'status'),
    },
  );
}

/** `check_channel` (capabilities): one channel, or every channel Genfeed supports. */
function buildCapabilitiesView(payload: unknown): McpCardView {
  const channels = Array.isArray(payload)
    ? rows(payload)
    : text(record(payload), 'platform')
      ? [record(payload)]
      : [];
  return {
    cards: channels.slice(0, 24).map(capabilityCard),
    layout: 'cards',
    title: 'Channels',
    total: channels.length,
  };
}

function issueFact(
  label: string,
  singular: string,
  count: number,
  status: string,
): McpCardFact {
  return count
    ? { label, status, value: `${count} ${singular}${count === 1 ? '' : 's'}` }
    : { label, status: 'completed', value: `No ${singular}s` };
}

/** `check_channel` (validate): can this post go to this channel, and if not why. */
function buildValidationView(payload: unknown): McpCardView {
  const data = record(payload);
  const platform = text(data, 'platform');
  const errors = rows(data.errors);
  const warnings = rows(data.warnings);
  const state = text(data, 'validationState');
  const readinessState = text(record(data.readiness), 'state');
  const issues = [
    ...errors.map((item) => `Error: ${text(item, 'message')}`),
    ...warnings.map((item) => `Warning: ${text(item, 'message')}`),
  ];
  const card = summaryCard(
    `${channelLabel(platform, text(record(data.capability), 'label'))} check`,
    [
      issueFact('Errors', 'error', errors.length, 'failed'),
      issueFact('Warnings', 'warning', warnings.length, 'needs_attention'),
      ...(readinessState
        ? [
            {
              label: 'Publishing readiness',
              status: readinessState,
              value: READINESS_LABELS[readinessState] ?? words(readinessState),
            },
          ]
        : []),
    ],
    {
      description:
        issues.join('\n') ||
        (data.valid === true ? 'Ready to schedule on this channel.' : ''),
      id: platform,
      platform,
      status: state === 'warning' ? 'needs_attention' : state,
    },
  );
  return {
    cards: [card],
    isCountHidden: true,
    layout: 'cards',
    title: 'Channel check',
    total: 1,
  };
}

/** Scheduled release tools: the release, its status and where it goes. */
function buildReleaseView(resource: Record<string, unknown>): McpCardView {
  // The release arrives as a JSON:API resource: its fields sit under
  // `attributes`, beside the top-level `id`.
  const data = { ...resource, ...record(resource.attributes) };
  const targets = (Array.isArray(data.targets) ? data.targets : []).map(record);
  const channels = targets.flatMap((target) => {
    const platform = text(target, 'platform');
    return platform
      ? [
          {
            label: platform,
            platform,
            status: text(target, 'executionState', 'status'),
          },
        ]
      : [];
  });
  const card = summaryCard(
    text(data, 'title') || 'Scheduled release',
    [
      ...(channels.length
        ? [
            {
              items: channels,
              label: 'Channels',
              value: channels.map((channel) => channel.label).join(', '),
            },
          ]
        : []),
      ...fact('Brand', text(data, 'brandName')),
      ...fact('Timezone', text(data, 'timezone')),
    ],
    {
      date: text(data, 'scheduledAt', 'publishedAt'),
      description: text(data, 'baseContent').slice(0, 4000),
      id: text(data, 'id'),
      status: words(text(data, 'status')),
    },
  );
  return {
    cards: [card],
    isCountHidden: true,
    layout: 'cards',
    title: 'Scheduled release',
    total: 1,
  };
}

/**
 * A write that waits for a person: what it is, what it costs, and Approve /
 * Decline buttons when this connection may resolve it. The result is an error
 * so the model knows nothing ran; the card is how the person acts on it.
 */
function buildApprovalView(
  data: Record<string, unknown>,
): McpCardView | undefined {
  const approvalId = text(data, 'approvalId');
  if (text(data, 'code') !== 'approval_pending' || !approvalId) {
    return undefined;
  }
  const credits =
    typeof data.estimatedCredits === 'number'
      ? data.estimatedCredits
      : undefined;
  const card = summaryCard(
    words(text(data, 'toolName')) || 'Action',
    credits === undefined
      ? []
      : fact('Estimated cost', `${formatAmount(credits)} credits`),
    {
      ...(data.canResolveApproval === true
        ? {
            actions: [
              {
                approvalId,
                decision: 'approve' as const,
                kind: 'resolve_approval' as const,
                label: 'Approve',
              },
              {
                approvalId,
                decision: 'decline' as const,
                kind: 'resolve_approval' as const,
                label: 'Decline',
              },
            ],
          }
        : {}),
      description: 'This action needs your approval before it runs.',
      id: approvalId,
      linkLabel: 'Review in Genfeed',
      status: 'pending_approval',
      url: safeCardUrl(text(data, 'nextStepUrl')),
    },
  );
  return {
    cards: [card],
    isApproval: true,
    isCountHidden: true,
    layout: 'cards',
    title: 'Approval needed',
    total: 1,
  };
}

/** Adds the approval card to a queued-write result; other errors pass through. */
export function withApprovalCard<T extends McpAppResult>(result: T): T {
  if (!result.isError || !result.structuredContent) return result;
  const view = buildApprovalView(result.structuredContent);
  return view
    ? {
        ...result,
        structuredContent: { ...result.structuredContent, genfeedCards: view },
      }
    : result;
}

export function buildCardView(
  name: string,
  payload: unknown,
): McpCardView | undefined {
  const baseKind = TOOL_KINDS[name];
  if (!baseKind) return undefined;
  const data = record(payload);
  if (name === 'get_account') return buildAccountView(data);
  if (name === 'get_brands') return buildBrandsView(data);
  if (name === 'get_orgs' || name === 'switch_org') {
    return buildOrganizationsView(data);
  }
  if (name === 'get_brand_publishing_readiness') {
    return buildReadinessView(payload);
  }
  if (name === 'get_scheduler_capabilities') {
    return buildCapabilitiesView(payload);
  }
  if (name === 'validate_scheduler_target') return buildValidationView(payload);
  if (baseKind === 'summary') return buildReleaseView(data);
  if (name === 'get_posts' && Array.isArray(data.gapDays)) {
    return buildCalendarView(data);
  }
  const kind: McpCardKind =
    name === 'generate_content' && text(data, 'articleId')
      ? 'article'
      : baseKind;
  if (
    name === 'generate_content' &&
    kind === 'post' &&
    Array.isArray(data.variations)
  ) {
    const variations = data.variations
      .map(record)
      .filter((row) => text(row, 'content'));
    if (variations.length) {
      const cards = variations.slice(0, 24).map((row, index) =>
        card(
          {
            ...data,
            ...row,
            ...(variations.length > 1
              ? { title: `Variation ${index + 1}` }
              : {}),
          },
          kind,
        ),
      );
      return {
        cards,
        layout: 'posts',
        title: 'Generated content',
        total: variations.length,
      };
    }
  }
  const collection = Array.isArray(payload)
    ? payload
    : [
        'posts',
        'images',
        'videos',
        'articles',
        'music',
        'avatars',
        'items',
        'assets',
        'characters',
      ]
        .map((key) => data[key])
        .find(Array.isArray);
  const rows =
    collection ??
    (Object.keys(data).length ? [data.post ?? data.article ?? data] : []);
  const cards = rows.slice(0, 24).map((value) => card(record(value), kind));
  const count =
    typeof data.total === 'number' && Number.isFinite(data.total)
      ? data.total
      : rows.length;
  return {
    cards,
    layout: layoutFor(kind),
    title: VIEW_TITLES[name] ?? words(name),
    total: Math.max(count, rows.length),
  };
}

export function withCardResult<T extends McpAppResult>(
  name: string,
  result: T,
) {
  if (result.isError || !result.structuredContent) return result;
  const view = buildCardView(name, result.structuredContent.data);
  if (!view) return result;
  return {
    ...result,
    structuredContent: {
      ...result.structuredContent,
      ...(name === 'get_brands'
        ? { data: withoutBrandLogos(record(result.structuredContent.data)) }
        : {}),
      genfeedCards: view,
    },
  };
}
