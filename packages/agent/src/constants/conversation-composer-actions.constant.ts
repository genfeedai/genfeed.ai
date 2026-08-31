import type {
  ConversationComposerActionDefinition,
  ConversationComposerActionName,
  ParsedConversationComposerCommand,
} from '@genfeedai/agent/models/conversation-composer.model';
import { APP_ROUTES } from '@genfeedai/constants';

/**
 * Preferred product surface for each slash command.
 *
 * Routing is NOT "brand-only or fail". Shell resolution is always:
 * - brand selected (route slug or selected brand) → brand URL
 * - otherwise → org (`~/`) URL
 *
 * `requiredScope` documents the preferred scope for authorization/copy; it
 * must not force a silent brand drop when a brand is already selected.
 */
export const CONVERSATION_COMPOSER_ACTIONS = [
  {
    description: 'New content in Studio',
    isConsequentialProposal: false,
    label: 'Create',
    name: 'create',
    requiredScope: 'brand',
    route: APP_ROUTES.STUDIO.ROOT,
  },
  {
    description: 'Remix existing content',
    isConsequentialProposal: false,
    label: 'Remix',
    name: 'remix',
    requiredScope: 'brand',
    route: APP_ROUTES.PUBLISHING.REMIX,
  },
  {
    description: 'Find trends and inspiration',
    isConsequentialProposal: false,
    label: 'Discover',
    name: 'discover',
    requiredScope: 'brand',
    route: APP_ROUTES.DISCOVERY.ROOT,
  },
  {
    description: 'Browse and run workflows',
    isConsequentialProposal: false,
    label: 'Workflows',
    name: 'workflow',
    requiredScope: 'brand',
    route: APP_ROUTES.AUTOMATION.WORKFLOWS,
  },
  {
    description: 'Content calendar',
    isConsequentialProposal: true,
    label: 'Schedule',
    name: 'schedule',
    requiredScope: 'brand',
    route: APP_ROUTES.PUBLISHING.CALENDAR,
  },
  {
    description: 'Review before publishing',
    isConsequentialProposal: true,
    label: 'Publish',
    name: 'publish',
    requiredScope: 'brand',
    route: APP_ROUTES.PUBLISHING.REVIEW,
  },
  {
    description: 'Content analytics',
    isConsequentialProposal: false,
    label: 'Analyze',
    name: 'analyze',
    requiredScope: 'brand',
    route: APP_ROUTES.ANALYTICS.OVERVIEW,
  },
  {
    description: 'Messages and replies',
    isConsequentialProposal: true,
    label: 'Reply',
    name: 'reply',
    requiredScope: 'brand',
    route: APP_ROUTES.MESSAGES.ROOT,
  },
] as const satisfies readonly ConversationComposerActionDefinition[];

export interface ResolveConversationComposerDestinationParams {
  activeHref: (path: string) => string;
  orgHref: (path: string) => string;
  route: string;
  /** Brand slug from the URL (`/:org/:brand/...`). */
  routeBrandSlug?: string | null;
  /** Brand slug from the operator's selected brand context. */
  selectedBrandSlug?: string | null;
}

/**
 * Single routing rule for every trusted slash action:
 * brand selected → brand URL; otherwise org (`~/`) URL.
 */
export function resolveConversationComposerDestinationHref(
  params: ResolveConversationComposerDestinationParams,
): string {
  const hasBrandTarget = Boolean(
    params.routeBrandSlug?.trim() || params.selectedBrandSlug?.trim(),
  );
  return hasBrandTarget
    ? params.activeHref(params.route)
    : params.orgHref(params.route);
}

const ACTIONS_BY_NAME = new Map<
  ConversationComposerActionName,
  ConversationComposerActionDefinition
>(
  CONVERSATION_COMPOSER_ACTIONS.map((action) => [action.name, action] as const),
);

export function getConversationComposerAction(
  name: string,
): ConversationComposerActionDefinition | null {
  return ACTIONS_BY_NAME.get(name as ConversationComposerActionName) ?? null;
}

export function parseConversationComposerCommand(
  text: string,
): ParsedConversationComposerCommand {
  const match = /^\/([^\s/]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!match) {
    return { kind: 'none' };
  }

  const commandName = match[1]?.toLowerCase() ?? '';
  const action = getConversationComposerAction(commandName);
  if (!action) {
    return { command: { command: commandName }, kind: 'unknown' };
  }

  return {
    invocation: {
      action,
      arguments: match[2]?.trim() ?? '',
    },
    kind: 'action',
  };
}
