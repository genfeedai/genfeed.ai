import { buildSingleSerializer } from '@serializers/builders';
import {
  postListSerializerConfig,
  postSerializerConfig,
} from '@serializers/configs';

// NOTE: `buildSingleSerializer` (not destructured `buildSerializer`) is required
// here. `buildSerializer` keys its return object by the config `type`, so both
// `postSerializerConfig` and `postListSerializerConfig` — which share
// `type: 'post'` (a post list is still JSON:API resource type `post`) — return
// `{ PostSerializer }`. Destructuring `{ PostListSerializer }` from that object
// yielded `undefined`, and `serializeCollection(req, undefined, data)` then fell
// back to returning the raw `docs` array instead of a `{ data: [...] }`
// collection document, breaking the calendar client (#1223).
export const PostSerializer = buildSingleSerializer(
  'server',
  postSerializerConfig,
);

export const PostListSerializer = buildSingleSerializer(
  'server',
  postListSerializerConfig,
);
