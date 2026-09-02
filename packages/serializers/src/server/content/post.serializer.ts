import { normalizeReviewDecision } from '@genfeedai/contracts';
import { buildSingleSerializer } from '@serializers/builders';
import {
  postListSerializerConfig,
  postSerializerConfig,
  publicPostSerializerConfig,
} from '@serializers/configs';
import type { ISerializer } from '@serializers/interfaces';

type PostRecord = Record<string, unknown>;

function isPostRecord(value: unknown): value is PostRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalizePostRecord(value: unknown): unknown {
  if (!isPostRecord(value)) return value;

  const normalized: PostRecord = {
    ...value,
    reviewDecision: normalizeReviewDecision(value.reviewDecision),
  };

  if (Array.isArray(value.reviewEvents)) {
    normalized.reviewEvents = value.reviewEvents.map((event) =>
      isPostRecord(event)
        ? {
            ...event,
            decision: normalizeReviewDecision(event.decision),
          }
        : event,
    );
  }

  if (Array.isArray(value.children)) {
    normalized.children = value.children.map(canonicalizePostRecord);
  }
  if (isPostRecord(value.parent)) {
    normalized.parent = canonicalizePostRecord(value.parent);
  }

  return normalized;
}

function canonicalizePostPayload(value: unknown): unknown {
  return Array.isArray(value)
    ? value.map(canonicalizePostRecord)
    : canonicalizePostRecord(value);
}

function withCanonicalReviewDecisions(serializer: ISerializer): ISerializer {
  const serialize = serializer.serialize.bind(serializer);
  serializer.serialize = (value: unknown) =>
    serialize(canonicalizePostPayload(value));
  return serializer;
}

// NOTE: `buildSingleSerializer` (not destructured `buildSerializer`) is required
// here. `buildSerializer` keys its return object by the config `type`, so both
// `postSerializerConfig` and `postListSerializerConfig` — which share
// `type: 'post'` (a post list is still JSON:API resource type `post`) — return
// `{ PostSerializer }`. Destructuring `{ PostListSerializer }` from that object
// yielded `undefined`, and `serializeCollection(req, undefined, data)` then fell
// back to returning the raw `docs` array instead of a `{ data: [...] }`
// collection document, breaking the calendar client (#1223).
export const PostSerializer = withCanonicalReviewDecisions(
  buildSingleSerializer('server', postSerializerConfig),
);

export const PostListSerializer = withCanonicalReviewDecisions(
  buildSingleSerializer('server', postListSerializerConfig),
);

export const PublicPostSerializer = buildSingleSerializer(
  'server',
  publicPostSerializerConfig,
);
