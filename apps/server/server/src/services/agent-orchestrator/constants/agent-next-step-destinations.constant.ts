import { APP_ROUTES } from '@genfeedai/constants';

export interface AgentNextStepDestination {
  /** Product-language label used when the model supplies no title. */
  label: string;
  href: string;
  /** Verb for the navigation CTA, e.g. "Open brand settings". */
  ctaLabel: string;
}

/**
 * Server-owned destinations for `suggest_next_steps`. The model picks a key; it
 * never authors a URL. That keeps every offered choice on a route that actually
 * exists — model-authored hrefs are the reason `normalizeAppHref` exists.
 *
 * Keys are the enum in the `suggest_next_steps` tool schema
 * (`packages/actions/src/registry/source/agent-only/other.tools.ts`); the pairing
 * is asserted in `agent-next-step-destinations.constant.spec.ts`.
 */
export const AGENT_NEXT_STEP_DESTINATIONS = {
  agent: {
    ctaLabel: 'Start a conversation',
    href: APP_ROUTES.AGENT.NEW,
    label: 'New agent conversation',
  },
  analytics: {
    ctaLabel: 'Open analytics',
    href: APP_ROUTES.ANALYTICS.OVERVIEW,
    label: 'Analytics',
  },
  billing: {
    ctaLabel: 'Open billing',
    href: APP_ROUTES.SETTINGS.SUBSCRIPTION,
    label: 'Plan and billing',
  },
  brand_settings: {
    ctaLabel: 'Open brand settings',
    href: APP_ROUTES.SETTINGS.BRANDS,
    label: 'Brand setup',
  },
  calendar: {
    ctaLabel: 'Open calendar',
    href: APP_ROUTES.PUBLISHING.CALENDAR,
    label: 'Content calendar',
  },
  connect_accounts: {
    ctaLabel: 'Open connections',
    href: APP_ROUTES.SETTINGS.SOCIAL,
    label: 'Connected accounts',
  },
  credits: {
    ctaLabel: 'Open credits',
    href: APP_ROUTES.SETTINGS.CREDITS,
    label: 'Credits',
  },
  library: {
    ctaLabel: 'Open library',
    href: APP_ROUTES.LIBRARY.ASSETS,
    label: 'Library',
  },
  members: {
    ctaLabel: 'Open members',
    href: APP_ROUTES.SETTINGS.MEMBERS,
    label: 'Team members',
  },
  models: {
    ctaLabel: 'Open models',
    href: APP_ROUTES.SETTINGS.MODELS,
    label: 'Model defaults',
  },
  posts: {
    ctaLabel: 'Open posts',
    href: APP_ROUTES.PUBLISHING.POSTS,
    label: 'Posts',
  },
  provider_keys: {
    ctaLabel: 'Open provider keys',
    href: APP_ROUTES.SETTINGS.INTEGRATIONS,
    label: 'Provider API keys',
  },
  publishing_settings: {
    ctaLabel: 'Open publishing settings',
    href: APP_ROUTES.SETTINGS.PUBLISHING,
    label: 'Publishing defaults',
  },
  review_queue: {
    ctaLabel: 'Open reviews',
    href: APP_ROUTES.PUBLISHING.REVIEW,
    label: 'Reviews',
  },
  settings: {
    ctaLabel: 'Open settings',
    href: APP_ROUTES.SETTINGS.ROOT,
    label: 'Default settings',
  },
  studio: {
    ctaLabel: 'Open studio',
    href: APP_ROUTES.STUDIO.ROOT,
    label: 'Studio',
  },
  workflows: {
    ctaLabel: 'Open workflows',
    href: APP_ROUTES.AUTOMATION.WORKFLOWS,
    label: 'Automations',
  },
} as const satisfies Record<string, AgentNextStepDestination>;

export type AgentNextStepDestinationKey =
  keyof typeof AGENT_NEXT_STEP_DESTINATIONS;

export const AGENT_NEXT_STEP_DESTINATION_KEYS = Object.keys(
  AGENT_NEXT_STEP_DESTINATIONS,
) as AgentNextStepDestinationKey[];

export function isAgentNextStepDestinationKey(
  value: unknown,
): value is AgentNextStepDestinationKey {
  return (
    typeof value === 'string' &&
    Object.hasOwn(AGENT_NEXT_STEP_DESTINATIONS, value)
  );
}
