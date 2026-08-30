/**
 * Structured vocabulary for ActivityKey wire values.
 *
 * Wire format stays flat kebab-case strings (Postgres / Prisma). Call sites that
 * need hierarchy use `ActivityKeys` (see activity-keys.tree.ts). Descriptions
 * resolve to message ids + params so UI callers can format them with their
 * locale catalog without changing this persisted vocabulary.
 */

import { ActivityKey } from './activity.enum';

/** Lifecycle phase of an activity event (template axis). */
export type ActivityLifecycle =
  | 'processing'
  | 'completed'
  | 'failed'
  | 'scheduled'
  | 'published'
  | 'created'
  | 'disconnected';

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
  };

const OPERATION_TOKENS = new Set(['enhance', 'reframe', 'remix', 'upscale']);

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

    case 'activity.credits.add':
      return descriptor.params.amount === 'none'
        ? 'Credits added'
        : `${descriptor.params.amount} credits added`;
    case 'activity.credits.remove':
      if (descriptor.params.amount !== 'none') {
        return descriptor.params.source === 'none'
          ? `${descriptor.params.amount} credits used`
          : `${descriptor.params.source} · ${descriptor.params.amount} credits used`;
      }
      return descriptor.params.source === 'none'
        ? 'Credit deduction'
        : descriptor.params.source;
    case 'activity.credits.remove_all':
      return 'Removed all credits';
    case 'activity.credits.reset':
      return 'Reset credits';

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
