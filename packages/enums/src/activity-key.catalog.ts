/**
 * Structured vocabulary for ActivityKey wire values.
 *
 * Wire format stays flat kebab-case strings (Postgres / Prisma). Call sites that
 * need hierarchy use `ActivityKeys` (see activity-keys.tree.ts). Descriptions
 * are built from templates + params so i18n can swap the catalog later without
 * another giant switch.
 */

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
 * i18n-ready message handle. Today we format English from this; later a
 * locale catalog can resolve `id` + `params` without touching callers.
 */
export interface ActivityMessageDescriptor {
  id:
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
  params: {
    operation?: string;
    subject: string;
  };
}

const LIFECYCLE_BY_TOKEN: Record<string, ActivityLifecycle> = {
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
    if (key === 'credits-add') {
      return {
        key,
        lifecycle: 'completed',
        operation: 'credit',
        subject: 'credits',
      };
    }
    if (key === 'credits-remove') {
      return {
        key,
        lifecycle: 'completed',
        operation: 'credit',
        subject: 'credits',
      };
    }
    if (key === 'credits-remove-all') {
      return {
        key,
        lifecycle: 'completed',
        operation: 'credit',
        subject: 'credits',
      };
    }
    if (key === 'credits-reset') {
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
      const lifecycle =
        tail === 'created'
          ? 'created'
          : tail === 'completed'
            ? 'completed'
            : tail === 'failed'
              ? 'failed'
              : 'processing';
      return {
        key,
        lifecycle,
        operation: 'train',
        subject: 'model',
      };
    }
    return null;
  },
  (key) => {
    if (key.startsWith('content-publish-')) {
      const tail = key.slice('content-publish-'.length);
      const lifecycle =
        tail === 'published'
          ? 'published'
          : tail === 'scheduled'
            ? 'scheduled'
            : tail === 'failed'
              ? 'failed'
              : 'processing';
      return {
        key,
        lifecycle,
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
 * Build a stable message descriptor. Format with `formatActivityMessage`
 * (English today) or a future i18n layer.
 */
export function getActivityMessageDescriptor(
  key: string,
): ActivityMessageDescriptor {
  const parts = parseActivityKey(key);
  const subjectLabel = getActivitySubjectLabel(parts.subject);
  const operationLabel =
    parts.operation === 'generate'
      ? undefined
      : getActivityOperationLabel(parts.operation);

  if (parts.subject === 'credits') {
    if (key === 'credits-add') {
      return { id: 'activity.credits.add', params: { subject: subjectLabel } };
    }
    if (key === 'credits-remove') {
      return {
        id: 'activity.credits.remove',
        params: { subject: subjectLabel },
      };
    }
    if (key === 'credits-remove-all') {
      return {
        id: 'activity.credits.remove_all',
        params: { subject: subjectLabel },
      };
    }
    if (key === 'credits-reset') {
      return {
        id: 'activity.credits.reset',
        params: { subject: subjectLabel },
      };
    }
  }

  if (key === 'post-generated') {
    return { id: 'activity.post.ready', params: { subject: subjectLabel } };
  }

  const baseParams = {
    subject: subjectLabel,
    ...(operationLabel ? { operation: operationLabel } : {}),
  };

  switch (parts.lifecycle) {
    case 'processing':
      return { id: 'activity.lifecycle.processing', params: baseParams };
    case 'failed':
      return { id: 'activity.lifecycle.failed', params: baseParams };
    case 'scheduled':
      return { id: 'activity.lifecycle.scheduled', params: baseParams };
    case 'published':
      return { id: 'activity.lifecycle.published', params: baseParams };
    case 'created':
      return { id: 'activity.lifecycle.created', params: baseParams };
    case 'disconnected':
      return { id: 'activity.lifecycle.disconnected', params: baseParams };
    case 'completed':
      return { id: 'activity.lifecycle.completed', params: baseParams };
    default:
      return { id: 'activity.fallback', params: baseParams };
  }
}

/** English formatter — replace with locale catalog when i18n lands. */
export function formatActivityMessage(
  descriptor: ActivityMessageDescriptor,
): string {
  const subject = descriptor.params.subject;
  const operation = descriptor.params.operation;
  const articleSubject = withIndefiniteArticle(subject);

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
        return `${subject.charAt(0).toUpperCase()}${subject.slice(1)} relocated`;
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
        return `${subject.charAt(0).toUpperCase()}${subject.slice(1)} failed`;
      }
      if (operation === 'publish') {
        return `Failed to publish ${subject}`;
      }
      if (operation === 'connect') {
        return `${subject.charAt(0).toUpperCase()}${subject.slice(1)} failed`;
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
      return `${subject.charAt(0).toUpperCase()}${subject.slice(1)} disconnected`;

    case 'activity.credits.add':
      return 'Credits added';
    case 'activity.credits.remove':
      return 'Credit deduction';
    case 'activity.credits.remove_all':
      return 'Removed all credits';
    case 'activity.credits.reset':
      return 'Reset credits';

    case 'activity.post.ready':
      return 'Content is ready for review';

    case 'activity.fallback':
    default:
      return humanizeToken(subject);
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
