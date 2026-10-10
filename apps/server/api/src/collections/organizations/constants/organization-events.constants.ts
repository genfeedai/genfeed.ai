/**
 * Emitted after `POST /organizations` provisions a new organization and its
 * default brand. Payload: `OrganizationCreatedEvent`.
 */
export const ORGANIZATION_CREATED_EVENT = 'organization.created';

/**
 * Emitted when a user finishes or skips organization onboarding (classic
 * wizard completion, the skip settings write, or the agent-first completion
 * tool). Payload: `OrganizationOnboardingFinishedEvent`. Every path may emit
 * it more than once; listeners must be idempotent.
 */
export const ORGANIZATION_ONBOARDING_FINISHED_EVENT =
  'organization.onboarding-finished';
