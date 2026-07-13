import type {
  ConversationComposerActionDefinition,
  ConversationComposerActionName,
  ParsedConversationComposerCommand,
} from '@genfeedai/agent/models/conversation-composer.model';
import { APP_ROUTES } from '@genfeedai/constants';

export const CONVERSATION_COMPOSER_ACTIONS = [
  {
    description: 'Open a trusted creation surface',
    isConsequentialProposal: false,
    label: 'Create',
    name: 'create',
    requiredScope: 'brand',
    route: APP_ROUTES.STUDIO.ROOT,
  },
  {
    description: 'Open the canonical remix workspace',
    isConsequentialProposal: false,
    label: 'Remix',
    name: 'remix',
    requiredScope: 'brand',
    route: APP_ROUTES.POSTS.REMIX,
  },
  {
    description: 'Open the research workspace',
    isConsequentialProposal: false,
    label: 'Research',
    name: 'research',
    requiredScope: 'brand',
    route: APP_ROUTES.RESEARCH.ROOT,
  },
  {
    description: 'Open deterministic workflows',
    isConsequentialProposal: false,
    label: 'Workflow',
    name: 'workflow',
    requiredScope: 'brand',
    route: APP_ROUTES.WORKFLOWS.ROOT,
  },
  {
    description: 'Open scheduling controls',
    isConsequentialProposal: true,
    label: 'Schedule',
    name: 'schedule',
    requiredScope: 'brand',
    route: APP_ROUTES.POSTS.CALENDAR,
  },
  {
    description: 'Open version-bound publish review',
    isConsequentialProposal: true,
    label: 'Publish',
    name: 'publish',
    requiredScope: 'brand',
    route: APP_ROUTES.POSTS.REVIEW,
  },
  {
    description: 'Open content analytics',
    isConsequentialProposal: false,
    label: 'Analyze',
    name: 'analyze',
    requiredScope: 'organization',
    route: APP_ROUTES.ANALYTICS.ROOT,
  },
  {
    description: 'Open the messaging reply surface',
    isConsequentialProposal: true,
    label: 'Reply',
    name: 'reply',
    requiredScope: 'brand',
    route: APP_ROUTES.MESSAGES.ROOT,
  },
] as const satisfies readonly ConversationComposerActionDefinition[];

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
