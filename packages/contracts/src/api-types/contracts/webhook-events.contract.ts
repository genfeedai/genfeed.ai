import { z } from 'zod';
import {
  GENERATION_WEBHOOK_EVENT_TYPES,
  generationWebhookPayloadSchema,
} from './generation-webhook-events.contract';
import {
  PUBLISH_WEBHOOK_EVENT_TYPES,
  publishWebhookPayloadSchema,
} from './publish-webhook-events.contract';
import {
  WORKFLOW_WEBHOOK_EVENT_TYPES,
  workflowWebhookPayloadSchema,
} from './workflow-webhook-events.contract';

/**
 * The full outbound webhook catalog. This is the vocabulary an organization
 * filters on (`organizationSettings.webhookEventTypes`) — an empty filter means
 * every event in this list is delivered.
 */
export const ORGANIZATION_WEBHOOK_EVENT_TYPES = [
  ...PUBLISH_WEBHOOK_EVENT_TYPES,
  ...GENERATION_WEBHOOK_EVENT_TYPES,
  ...WORKFLOW_WEBHOOK_EVENT_TYPES,
] as const;

export const organizationWebhookEventTypeSchema = z.enum(
  ORGANIZATION_WEBHOOK_EVENT_TYPES,
);

export const organizationWebhookPayloadSchema = z.union([
  publishWebhookPayloadSchema,
  generationWebhookPayloadSchema,
  workflowWebhookPayloadSchema,
]);

export type OrganizationWebhookEventType = z.infer<
  typeof organizationWebhookEventTypeSchema
>;
export type OrganizationWebhookPayload = z.infer<
  typeof organizationWebhookPayloadSchema
>;

export function isOrganizationWebhookEventType(
  value: unknown,
): value is OrganizationWebhookEventType {
  return (
    typeof value === 'string' &&
    ORGANIZATION_WEBHOOK_EVENT_TYPES.includes(
      value as OrganizationWebhookEventType,
    )
  );
}

/**
 * Org event filters are opt-in narrowing: an empty (or unset) list delivers the
 * whole catalog. Unknown values in the stored list are ignored rather than
 * treated as a match, so a stale filter never silently enables an event.
 */
export function isOrganizationWebhookEventEnabled(
  configuredEvents: readonly string[],
  event: OrganizationWebhookEventType,
): boolean {
  const known = configuredEvents.filter(isOrganizationWebhookEventType);

  if (known.length === 0) {
    return true;
  }

  return known.includes(event);
}
