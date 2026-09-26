/**
 * Structured vocabulary for ActivityKey wire values.
 *
 * Wire format stays flat kebab-case strings (Postgres / Prisma). Call sites that
 * need hierarchy use `ActivityKeys` (see activity-keys.tree.ts). Descriptions
 * resolve to message ids + params so UI callers can format them with their
 * locale catalog without changing this persisted vocabulary.
 */

import { ActivityKey, ActivitySource } from './activity.enum';
import { CreditTransactionCategory } from './credit.enum';

/**
 * ICU `select` selectors must be valid identifiers — FormatJS rejects hyphens
 * (`EXPECT_SELECT_ARGUMENT_SELECTOR_FRAGMENT`). `CreditTransactionCategory.BYOK_USAGE`
 * stays `byok-usage` on the wire (Postgres / Prisma); this maps only the
 * message-facing selector consumed by `apps/app/messages/*` and the
 * `formatActivityMessage` fallback below.
 */
const BYOK_USAGE_SELECTOR = 'byok_usage';

function toIcuSafeCreditCategory(category: string): string {
  return category === CreditTransactionCategory.BYOK_USAGE
    ? BYOK_USAGE_SELECTOR
    : category;
}

/** Lifecycle phase of an activity event (template axis). */
export type ActivityLifecycle =
  | 'processing'
  | 'completed'
  | 'failed'
  | 'scheduled'
  | 'published'
  | 'created'
  | 'disconnected'
  | 'skipped';

/**
 * Verb / transform applied to the subject. `generate` is the default when the
 * wire key has no explicit operation segment (e.g. `image-processing`).
 */
export type ActivityOperation =
  | 'generate'
  | 'reframe'
  | 'upscale'
  | 'enhance'
  | 'remix'
  | 'publish'
  | 'train'
  | 'credit'
  | 'connect'
  | 'import'
  | 'relocate';

export interface ActivityKeyParts {
  key: string;
  lifecycle: ActivityLifecycle;
  operation: ActivityOperation;
  /** Machine subject token: image | video | post | prompt | … */
  subject: string;
}

/**
 * Stable message handle resolved by the app locale catalog.
 */
export type ActivityMessageId =
  | 'activity.lifecycle.processing'
  | 'activity.lifecycle.completed'
  | 'activity.lifecycle.failed'
  | 'activity.lifecycle.scheduled'
  | 'activity.lifecycle.published'
  | 'activity.lifecycle.created'
  | 'activity.lifecycle.disconnected'
  | 'activity.lifecycle.skipped'
  | 'activity.credits.change'
  | 'activity.credits.add'
  | 'activity.credits.remove'
  | 'activity.credits.reset'
  | 'activity.credits.remove_all'
  | 'activity.post.ready'
  | 'activity.fallback';

export interface ActivityMessageDescriptor {
  id: ActivityMessageId;
  params: {
    amount: string;
    count: number;
    creditCategory: string;
    articleSubject: string;
    capitalizedSubject: string;
    fallbackSubject: string;
    operation: string;
    source: string;
    subject: string;
  };
}

export type ActivityMessageFormatter = (
  descriptor: ActivityMessageDescriptor,
) => string;

/**
 * Exhaustive wire-key → message-id catalog.
 *
 * Keep the keys typed as ActivityKey so adding a persisted enum member cannot
 * ship until its customer-facing copy is deliberately assigned a message id.
 */
export const ACTIVITY_MESSAGE_ID_BY_KEY = {
  [ActivityKey.ARTICLE_FAILED]: 'activity.lifecycle.failed',
  [ActivityKey.ARTICLE_GENERATED]: 'activity.lifecycle.completed',
  [ActivityKey.ARTICLE_PROCESSING]: 'activity.lifecycle.processing',
  [ActivityKey.BRAND_RELOCATED]: 'activity.lifecycle.completed',
  [ActivityKey.CREDITS_ADD]: 'activity.credits.add',
  [ActivityKey.CREDITS_REMOVE]: 'activity.credits.remove',
  [ActivityKey.CREDITS_REMOVE_ALL]: 'activity.credits.remove_all',
  [ActivityKey.CREDITS_RESET]: 'activity.credits.reset',
  [ActivityKey.IMAGE_FAILED]: 'activity.lifecycle.failed',
  [ActivityKey.IMAGE_GENERATED]: 'activity.lifecycle.completed',
  [ActivityKey.IMAGE_PROCESSING]: 'activity.lifecycle.processing',
  [ActivityKey.IMAGE_REFRAME_COMPLETED]: 'activity.lifecycle.completed',
  [ActivityKey.IMAGE_REFRAME_FAILED]: 'activity.lifecycle.failed',
  [ActivityKey.IMAGE_REFRAME_PROCESSING]: 'activity.lifecycle.processing',
  [ActivityKey.IMAGE_UPSCALE_COMPLETED]: 'activity.lifecycle.completed',
  [ActivityKey.IMAGE_UPSCALE_FAILED]: 'activity.lifecycle.failed',
  [ActivityKey.IMAGE_UPSCALE_PROCESSING]: 'activity.lifecycle.processing',
  [ActivityKey.MODELS_TRAINING_COMPLETED]: 'activity.lifecycle.completed',
  [ActivityKey.MODELS_TRAINING_CREATED]: 'activity.lifecycle.created',
  [ActivityKey.MODELS_TRAINING_FAILED]: 'activity.lifecycle.failed',
  [ActivityKey.MUSIC_FAILED]: 'activity.lifecycle.failed',
  [ActivityKey.MUSIC_GENERATED]: 'activity.lifecycle.completed',
  [ActivityKey.MUSIC_PROCESSING]: 'activity.lifecycle.processing',
  [ActivityKey.POST_CREATED]: 'activity.lifecycle.created',
  [ActivityKey.POST_FAILED]: 'activity.lifecycle.failed',
  [ActivityKey.POST_GENERATED]: 'activity.post.ready',
  [ActivityKey.POST_PROCESSING]: 'activity.lifecycle.processing',
  [ActivityKey.POST_PUBLISHED]: 'activity.lifecycle.published',
  [ActivityKey.POST_SCHEDULED]: 'activity.lifecycle.scheduled',
  [ActivityKey.PROMPT_ENHANCE_COMPLETED]: 'activity.lifecycle.completed',
  [ActivityKey.PROMPT_ENHANCE_FAILED]: 'activity.lifecycle.failed',
  [ActivityKey.PROMPT_ENHANCE_PROCESSING]: 'activity.lifecycle.processing',
  [ActivityKey.PROMPT_REMIX_COMPLETED]: 'activity.lifecycle.completed',
  [ActivityKey.PROMPT_REMIX_FAILED]: 'activity.lifecycle.failed',
  [ActivityKey.PROMPT_REMIX_PROCESSING]: 'activity.lifecycle.processing',
  [ActivityKey.SOCIAL_HISTORY_IMPORT_COMPLETED]: 'activity.lifecycle.completed',
  [ActivityKey.SOCIAL_HISTORY_IMPORT_FAILED]: 'activity.lifecycle.failed',
  [ActivityKey.SOCIAL_HISTORY_IMPORT_SCHEDULED]: 'activity.lifecycle.scheduled',
  [ActivityKey.SOCIAL_HISTORY_IMPORT_SKIPPED]: 'activity.lifecycle.skipped',
  [ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED]:
    'activity.lifecycle.disconnected',
  [ActivityKey.SOCIAL_INTEGRATION_FAILED]: 'activity.lifecycle.failed',
  [ActivityKey.VIDEO_COMPLETED]: 'activity.lifecycle.completed',
  [ActivityKey.VIDEO_FAILED]: 'activity.lifecycle.failed',
  [ActivityKey.VIDEO_GENERATED]: 'activity.lifecycle.completed',
  [ActivityKey.VIDEO_PROCESSING]: 'activity.lifecycle.processing',
  [ActivityKey.VIDEO_REFRAME_COMPLETED]: 'activity.lifecycle.completed',
  [ActivityKey.VIDEO_REFRAME_FAILED]: 'activity.lifecycle.failed',
  [ActivityKey.VIDEO_REFRAME_PROCESSING]: 'activity.lifecycle.processing',
  [ActivityKey.VIDEO_SCHEDULED]: 'activity.lifecycle.scheduled',
  [ActivityKey.VIDEO_UPSCALE_COMPLETED]: 'activity.lifecycle.completed',
  [ActivityKey.VIDEO_UPSCALE_FAILED]: 'activity.lifecycle.failed',
  [ActivityKey.VIDEO_UPSCALE_PROCESSING]: 'activity.lifecycle.processing',
  [ActivityKey.VOICE_FAILED]: 'activity.lifecycle.failed',
  [ActivityKey.VOICE_GENERATED]: 'activity.lifecycle.completed',
  [ActivityKey.VOICE_PROCESSING]: 'activity.lifecycle.processing',
} as const satisfies Readonly<Record<ActivityKey, ActivityMessageId>>;

const ACTIVITY_MESSAGE_ID_LOOKUP: Readonly<
  Partial<Record<string, ActivityMessageId>>
> = ACTIVITY_MESSAGE_ID_BY_KEY;

const LIFECYCLE_BY_TOKEN: Readonly<Partial<Record<string, ActivityLifecycle>>> =
  {
    completed: 'completed',
    created: 'created',
    disconnected: 'disconnected',
    failed: 'failed',
    generated: 'completed',
    processing: 'processing',
    published: 'published',
    scheduled: 'scheduled',
    skipped: 'skipped',
  };

const OPERATION_TOKENS = new Set(['enhance', 'reframe', 'remix', 'upscale']);

const HISTORY_IMPORT_LIFECYCLES = new Set<ActivityLifecycle>([
  'completed',
  'failed',
  'scheduled',
  'skipped',
]);

const MODEL_TRAINING_LIFECYCLES = new Set<ActivityLifecycle>([
  'completed',
  'created',
  'failed',
]);
const CONTENT_PUBLISH_LIFECYCLES = new Set<ActivityLifecycle>([
  'failed',
  'published',
  'scheduled',
]);

function pickLifecycle(
  tail: string,
  allowed: ReadonlySet<ActivityLifecycle>,
  fallback: ActivityLifecycle,
): ActivityLifecycle {
  const lifecycle = LIFECYCLE_BY_TOKEN[tail];

  return lifecycle !== undefined && tail === lifecycle && allowed.has(lifecycle)
    ? lifecycle
    : fallback;
}

/** Subject display labels (English defaults; i18n keys use machine `subject`). */
const SUBJECT_LABELS: Record<string, string> = {
  article: 'article',
  brand: 'brand',
  content: 'content',
  credits: 'credits',
  image: 'image',
  integration: 'social integration',
  model: 'model training',
  music: 'music',
  post: 'post',
  prompt: 'prompt',
  video: 'video',
  voice: 'voice',
};

const OPERATION_LABELS: Record<ActivityOperation, string> = {
  connect: 'connect',
  credit: 'credit',
  enhance: 'enhance',
  generate: 'generate',
  import: 'import',
  publish: 'publish',
  reframe: 'reframe',
  relocate: 'relocate',
  remix: 'remix',
  train: 'train',
  upscale: 'upscale',
};

/** Multi-segment prefixes that are not `subject-op-phase`. */
const SPECIAL_PARSERS: Array<(key: string) => ActivityKeyParts | null> = [
  (key) => {
    if (
      key === 'credits-add' ||
      key === 'credits-remove' ||
      key === 'credits-remove-all' ||
      key === 'credits-reset'
    ) {
      return {
        key,
        lifecycle: 'completed',
        operation: 'credit',
        subject: 'credits',
      };
    }
    return null;
  },
  (key) => {
    if (key.startsWith('model-training-')) {
      const tail = key.slice('model-training-'.length);
      return {
        key,
        lifecycle: pickLifecycle(tail, MODEL_TRAINING_LIFECYCLES, 'processing'),
        operation: 'train',
        subject: 'model',
      };
    }
    return null;
  },
  (key) => {
    if (key.startsWith('content-publish-')) {
      const tail = key.slice('content-publish-'.length);
      return {
        key,
        lifecycle: pickLifecycle(
          tail,
          CONTENT_PUBLISH_LIFECYCLES,
          'processing',
        ),
        operation: 'publish',
        subject: 'post',
      };
    }
    if (key === 'content-created') {
      return {
        key,
        lifecycle: 'created',
        operation: 'generate',
        subject: 'post',
      };
    }
    return null;
  },
  (key) => {
    if (key.startsWith('integration-social-history-import-')) {
      const tail = key.slice('integration-social-history-import-'.length);
      return {
        key,
        lifecycle: pickLifecycle(tail, HISTORY_IMPORT_LIFECYCLES, 'scheduled'),
        operation: 'import',
        subject: 'integration',
      };
    }
    if (key.startsWith('integration-social-')) {
      const tail = key.slice('integration-social-'.length);
      return {
        key,
        lifecycle: tail === 'disconnected' ? 'disconnected' : 'failed',
        operation: 'connect',
        subject: 'integration',
      };
    }
    return null;
  },
  (key) => {
    if (key === 'brand-relocated') {
      return {
        key,
        lifecycle: 'completed',
        operation: 'relocate',
        subject: 'brand',
      };
    }
    return null;
  },
];

/**
 * Parse a wire ActivityKey string into subject / operation / lifecycle.
 * Unknown keys still produce a best-effort parse so new keys get free copy.
 */
export function parseActivityKey(key: string): ActivityKeyParts {
  const normalized = key.trim().toLowerCase();

  for (const parse of SPECIAL_PARSERS) {
    const special = parse(normalized);
    if (special) {
      return special;
    }
  }

  const segments = normalized.split('-').filter(Boolean);
  if (segments.length === 0) {
    return {
      key: normalized,
      lifecycle: 'completed',
      operation: 'generate',
      subject: 'content',
    };
  }

  const last = segments[segments.length - 1] ?? '';
  const lifecycle = LIFECYCLE_BY_TOKEN[last] ?? 'completed';
  const body = LIFECYCLE_BY_TOKEN[last] ? segments.slice(0, -1) : segments;

  if (body.length >= 2) {
    const maybeOp = body[body.length - 1] ?? '';
    if (OPERATION_TOKENS.has(maybeOp)) {
      return {
        key: normalized,
        lifecycle,
        operation: maybeOp as ActivityOperation,
        subject: body.slice(0, -1).join('-') || 'content',
      };
    }
  }

  return {
    key: normalized,
    lifecycle,
    operation: 'generate',
    subject: body.join('-') || 'content',
  };
}

export function getActivitySubjectLabel(subject: string): string {
  return SUBJECT_LABELS[subject] ?? subject.replace(/-/g, ' ');
}

export function getActivityOperationLabel(
  operation: ActivityOperation,
): string {
  return OPERATION_LABELS[operation];
}

function withIndefiniteArticle(noun: string): string {
  const word = noun.trim();
  if (!word) {
    return noun;
  }
  // "music" / "credits" / plurals skip article
  if (
    word.endsWith('s') ||
    word === 'music' ||
    word === 'content' ||
    word.includes(' ')
  ) {
    // multi-word subjects still get "a" when singular-ish
    if (word.includes(' ') && !word.endsWith('s')) {
      const first = word[0]?.toLowerCase() ?? '';
      return `${'aeiou'.includes(first) ? 'an' : 'a'} ${word}`;
    }
    return word;
  }
  const first = word[0]?.toLowerCase() ?? '';
  return `${'aeiou'.includes(first) ? 'an' : 'a'} ${word}`;
}

/**
 * Build a stable message descriptor for a locale catalog or English fallback.
 */
export function getActivityMessageDescriptor(
  key: string,
): ActivityMessageDescriptor {
  const parts = parseActivityKey(key);
  const subjectLabel = getActivitySubjectLabel(parts.subject);
  const params = {
    amount: 'none',
    count: 0,
    creditCategory: 'none',
    articleSubject: withIndefiniteArticle(subjectLabel),
    capitalizedSubject: `${subjectLabel.charAt(0).toUpperCase()}${subjectLabel.slice(1)}`,
    fallbackSubject: humanizeToken(subjectLabel),
    operation: getActivityOperationLabel(parts.operation),
    source: 'none',
    subject: subjectLabel,
  };
  const catalogId = ACTIVITY_MESSAGE_ID_LOOKUP[key];

  if (catalogId) {
    return { id: catalogId, params };
  }

  switch (parts.lifecycle) {
    case 'processing':
      return { id: 'activity.lifecycle.processing', params };
    case 'failed':
      return { id: 'activity.lifecycle.failed', params };
    case 'scheduled':
      return { id: 'activity.lifecycle.scheduled', params };
    case 'published':
      return { id: 'activity.lifecycle.published', params };
    case 'created':
      return { id: 'activity.lifecycle.created', params };
    case 'disconnected':
      return { id: 'activity.lifecycle.disconnected', params };
    case 'completed':
      return { id: 'activity.lifecycle.completed', params };
    default:
      return { id: 'activity.fallback', params };
  }
}

const CREDIT_ACTIVITY_SOURCE_LABELS: Record<string, string> = {
  [ActivitySource.BOT_GENERATION]: 'Agent conversation',
  [ActivitySource.IMAGE_GENERATION]: 'Image generation',
  [ActivitySource.VIDEO_GENERATION]: 'Video generation',
  [ActivitySource.MUSIC_GENERATION]: 'Music generation',
  [ActivitySource.ARTICLE_GENERATION]: 'Article generation',
  [ActivitySource.VOICE_GENERATION]: 'Voice generation',
  [ActivitySource.POST_GENERATION]: 'Post generation',
  [ActivitySource.PROMPT_ENHANCEMENT]: 'Prompt enhancement',
  [ActivitySource.PROMPT_REMIX]: 'Prompt remix',
  [ActivitySource.TWEET_REPLY]: 'Tweet reply',
  [ActivitySource.MODELS_TRAINING]: 'Model training',
  [ActivitySource.IMAGE_EVALUATION]: 'Image evaluation',
  [ActivitySource.VIDEO_EVALUATION]: 'Video evaluation',
  [ActivitySource.ARTICLE_EVALUATION]: 'Article evaluation',
  [ActivitySource.CONTENT_EVALUATION]: 'Content evaluation',
  [ActivitySource.VIDEO_REFRAME]: 'Video reframe',
  [ActivitySource.VIDEO_UPSCALE]: 'Video upscale',
  [ActivitySource.IMAGE_REFRAME]: 'Image reframe',
  [ActivitySource.IMAGE_UPSCALE]: 'Image upscale',
  [ActivitySource.PROMPT_CREATION]: 'Prompt creation',
  [ActivitySource.ARTICLE_ENHANCEMENT]: 'Article enhancement',
  [ActivitySource.ARTICLE_REMIX]: 'Article remix',
  [ActivitySource.POST_ENHANCEMENT]: 'Post enhancement',
  [ActivitySource.AVATAR_GENERATION]: 'Avatar generation',
  [ActivitySource.ASSET_GENERATION]: 'Asset generation',
  [ActivitySource.POST]: 'Content publish',
  [ActivitySource.SUBSCRIPTION]: 'Subscription credits',
  [ActivitySource.PAY_AS_YOU_GO]: 'Credit purchase',
  [ActivitySource.REFERRAL]: 'Referral reward',
  [ActivitySource.BRAND_INTERVIEW]: 'Brand context interview',
  [ActivitySource.EXPERT_FIRST_SYSTEM]: 'First content system generation',
  [ActivitySource.TREND_SCAN]: 'Trend research',
  [ActivitySource.ARTICLE_VIRALITY_ANALYSIS]: 'Article virality analysis',
  [ActivitySource.ARTICLE_PROMPT_GENERATION]: 'Article prompt generation',
};

export function getCreditActivitySourceLabel(
  source: string | undefined,
): string | undefined {
  return source ? CREDIT_ACTIVITY_SOURCE_LABELS[source] : undefined;
}

export function getCreditActivityKey(
  category: string | null | undefined,
): ActivityKey | undefined {
  switch (category) {
    case CreditTransactionCategory.ADD:
    case CreditTransactionCategory.REFUND:
    case CreditTransactionCategory.ROLLOVER:
      return ActivityKey.CREDITS_ADD;
    case CreditTransactionCategory.DEDUCT:
    case CreditTransactionCategory.EXPIRE:
    case CreditTransactionCategory.BYOK_USAGE:
      return ActivityKey.CREDITS_REMOVE;
    case CreditTransactionCategory.RESET:
      return ActivityKey.CREDITS_RESET;
    default:
      return undefined;
  }
}

export function getCreditActivityMessageDescriptor(
  key: string,
  value: string | undefined,
  source?: string,
): ActivityMessageDescriptor {
  const parsed = parseCreditActivityValue(value);
  const descriptor = getActivityMessageDescriptor(key);
  const category =
    parsed.category ??
    (key === ActivityKey.CREDITS_ADD
      ? CreditTransactionCategory.ADD
      : key === ActivityKey.CREDITS_RESET
        ? CreditTransactionCategory.RESET
        : CreditTransactionCategory.DEDUCT);
  const count =
    parsed.amount === null
      ? 0
      : category === CreditTransactionCategory.RESET
        ? parsed.amount
        : Math.abs(parsed.amount);
  return {
    ...descriptor,
    params: {
      ...descriptor.params,
      amount:
        parsed.amount === null
          ? 'none'
          : count.toLocaleString('en-US', { maximumFractionDigits: 20 }),
      count,
      creditCategory: toIcuSafeCreditCategory(category),
      source:
        parsed.description ?? getCreditActivitySourceLabel(source) ?? 'none',
    },
  };
}

export function getCreditActivityChangeDescriptor(
  key: string,
  value: string | undefined,
): ActivityMessageDescriptor | null {
  const descriptor = getCreditActivityMessageDescriptor(key, value);
  return descriptor.params.amount === 'none'
    ? null
    : { ...descriptor, id: 'activity.credits.change' };
}

/** Read the amount and charge reason from persisted credit activity values. */
export function parseCreditActivityValue(value: string | undefined): {
  amount: number | null;
  category?: CreditTransactionCategory;
  description: string | undefined;
} {
  let payload: unknown;
  try {
    payload = JSON.parse(value ?? '');
  } catch {
    payload = value;
  }
  const record =
    payload !== null && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : undefined;
  const rawAmount = record ? record.value : payload;
  const amount =
    typeof rawAmount === 'number' ||
    (typeof rawAmount === 'string' && rawAmount.trim())
      ? Number(rawAmount)
      : Number.NaN;
  const description =
    typeof record?.description === 'string'
      ? record.description.replace(/^\[BYOK\]\s*/, '').trim()
      : undefined;

  return {
    amount: Number.isFinite(amount) ? amount : null,
    ...(Object.values(CreditTransactionCategory).includes(
      record?.category as CreditTransactionCategory,
    )
      ? { category: record?.category as CreditTransactionCategory }
      : {}),
    description:
      description && !/^[{[]/.test(description) ? description : undefined,
  };
}

/** English fallback for non-app consumers that do not own a locale catalog. */
export function formatActivityMessage(
  descriptor: ActivityMessageDescriptor,
): string {
  const subject = descriptor.params.subject;
  const operation = descriptor.params.operation;
  const articleSubject = descriptor.params.articleSubject;

  switch (descriptor.id) {
    case 'activity.lifecycle.processing':
      if (operation === 'reframe') {
        return `Reframing ${articleSubject}...`;
      }
      if (operation === 'upscale') {
        return `Upscaling ${articleSubject}...`;
      }
      if (operation === 'enhance') {
        return `Enhancing ${articleSubject}...`;
      }
      if (operation === 'remix') {
        return `Remixing ${articleSubject}...`;
      }
      if (operation === 'train') {
        return `Starting ${subject}...`;
      }
      if (operation === 'publish') {
        return `Processing ${articleSubject}...`;
      }
      return `Generating ${articleSubject}...`;

    case 'activity.lifecycle.completed':
      if (operation === 'reframe') {
        return `Reframed ${articleSubject}`;
      }
      if (operation === 'upscale') {
        return `Upscaled ${articleSubject}`;
      }
      if (operation === 'enhance') {
        return `Enhanced ${articleSubject}`;
      }
      if (operation === 'remix') {
        return `Remixed ${articleSubject}`;
      }
      if (operation === 'train') {
        return `Completed ${subject}`;
      }
      if (operation === 'relocate') {
        return `${descriptor.params.capitalizedSubject} relocated`;
      }
      return `Generated ${articleSubject}`;

    case 'activity.lifecycle.failed':
      if (operation === 'reframe') {
        return `Failed to reframe ${subject}`;
      }
      if (operation === 'upscale') {
        return `Failed to upscale ${subject}`;
      }
      if (operation === 'enhance') {
        return `Failed to enhance ${subject}`;
      }
      if (operation === 'remix') {
        return `Failed to remix ${subject}`;
      }
      if (operation === 'train') {
        return `${descriptor.params.capitalizedSubject} failed`;
      }
      if (operation === 'publish') {
        return `Failed to publish ${subject}`;
      }
      if (operation === 'connect') {
        return `${descriptor.params.capitalizedSubject} failed`;
      }
      return `Failed to generate ${subject}`;

    case 'activity.lifecycle.scheduled':
      return `Scheduled ${articleSubject}`;

    case 'activity.lifecycle.published':
      return `Published ${articleSubject}`;

    case 'activity.lifecycle.created':
      if (operation === 'train') {
        return `Started ${subject}`;
      }
      return `Created ${articleSubject}`;

    case 'activity.lifecycle.disconnected':
      return `${descriptor.params.capitalizedSubject} disconnected`;

    case 'activity.credits.change': {
      const { count, creditCategory } = descriptor.params;
      const amount = count.toLocaleString('en-US', {
        maximumFractionDigits: 20,
      });
      const units = count === 1 ? 'credit' : 'credits';
      if (creditCategory === BYOK_USAGE_SELECTOR) return 'No credits charged';
      if (creditCategory === CreditTransactionCategory.RESET)
        return `Balance set to ${amount} ${units}`;
      const isAddition = [
        CreditTransactionCategory.ADD,
        CreditTransactionCategory.REFUND,
        CreditTransactionCategory.ROLLOVER,
      ].includes(creditCategory as CreditTransactionCategory);
      return `${isAddition ? '+' : '−'}${amount} ${units}`;
    }
    case 'activity.credits.add':
    case 'activity.credits.remove':
    case 'activity.credits.reset': {
      const reason =
        descriptor.params.source === 'none'
          ? undefined
          : descriptor.params.source;
      switch (descriptor.params.creditCategory) {
        case CreditTransactionCategory.REFUND:
          return reason ? `Credit refund: ${reason}` : 'Credits refunded';
        case CreditTransactionCategory.EXPIRE:
          return reason ? `Credits expired: ${reason}` : 'Credits expired';
        case CreditTransactionCategory.ROLLOVER:
          return reason
            ? `Credits rolled over: ${reason}`
            : 'Credits rolled over';
        case CreditTransactionCategory.RESET:
          return reason
            ? `Credit balance reset: ${reason}`
            : 'Credit balance reset';
        case BYOK_USAGE_SELECTOR:
          return `${reason ?? 'AI usage'} (your API key)`;
        default:
          if (reason) return reason;
          if (descriptor.id === 'activity.credits.add') return 'Credits added';
          if (descriptor.id === 'activity.credits.reset')
            return 'Credit balance reset';
          return 'Credit usage — details unavailable';
      }
    }
    case 'activity.credits.remove_all':
      return 'Removed all credits';

    case 'activity.post.ready':
      return 'Content is ready for review';

    default:
      return descriptor.params.fallbackSubject;
  }
}

function humanizeToken(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char: string) => char.toUpperCase());
}

/** Map wire key → coarse status for badges / background tasks. */
export function getActivityLifecycleStatus(
  key: string,
): 'processing' | 'completed' | 'failed' | 'pending' {
  const { lifecycle } = parseActivityKey(key);
  switch (lifecycle) {
    case 'processing':
    case 'created':
    case 'scheduled':
      return 'processing';
    case 'failed':
      return 'failed';
    case 'completed':
    case 'published':
    case 'disconnected':
      return 'completed';
    default:
      return 'pending';
  }
}
