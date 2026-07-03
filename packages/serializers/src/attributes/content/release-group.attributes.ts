import { createEntityAttributes } from '@genfeedai/helpers';

/**
 * Release group: one composed piece of content fanned out across channels.
 * Canonical scheduler response entity (#1124). Relationship keys (owner,
 * organization, brand, targets, attachments, recurrence) are also listed here
 * so the serializer emits them; the config wires them as relationships.
 */
export const releaseGroupAttributes = createEntityAttributes([
  'title',
  'baseContent',
  'media',
  'timezone',
  'ownerId',
  'owner',
  'organization',
  'brand',
  'status',
  'scheduledAt',
  'publishedAt',
  'recurrence',
  'idempotencyKey',
  'targets',
  'targetSummary',
  'attachments',
  'statusTransitions',
]);
