import type { AgentPageContext as AgentRequestPageContext } from '@genfeedai/agent/models/agent-chat.model';
import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';
import { getBrowserTimezone } from '@genfeedai/helpers/formatting/timezone/timezone.helper';

export interface AgentPageContextState extends AgentRequestPageContext {
  placeholder?: string;
  route: string;
  suggestedActions: SuggestedAction[];
}

function hasContextValue(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

type AgentPageContextTextKey =
  | 'contentFormat'
  | 'draftBody'
  | 'draftInstructions'
  | 'draftSummary'
  | 'draftTitle'
  | 'draftType'
  | 'postAuthor'
  | 'postContent'
  | 'route'
  | 'selectedText'
  | 'timezone'
  | 'url';

/**
 * Maps the visible page context onto the request payload. The viewer's
 * timezone rides along with any non-empty context so the agent can turn
 * "today" or "at 9am" into absolute schedule times.
 */
export function toAgentRequestPageContext(
  context: AgentPageContextState | null | undefined,
  timezone: string = getBrowserTimezone(),
): AgentRequestPageContext | undefined {
  if (!context) {
    return undefined;
  }

  const requestContext: AgentRequestPageContext = {};

  const assign = <Key extends AgentPageContextTextKey>(
    key: Key,
    value: AgentRequestPageContext[Key],
  ): void => {
    if (hasContextValue(value)) {
      requestContext[key] = value;
    }
  };

  assign('contentFormat', context.contentFormat);
  assign('draftBody', context.draftBody);
  assign('draftInstructions', context.draftInstructions);
  assign('draftSummary', context.draftSummary);
  assign('draftTitle', context.draftTitle);
  assign('draftType', context.draftType);
  assign('postAuthor', context.postAuthor);
  assign('postContent', context.postContent);
  assign('route', context.route);
  assign('selectedText', context.selectedText);
  assign('url', context.url);

  if (context.socialReferences?.length) {
    requestContext.socialReferences = context.socialReferences;
  }

  if (context.analyticsQuery?.kind === 'analytics-query') {
    requestContext.analyticsQuery = context.analyticsQuery;
  }

  if (context.researchReferences?.length) {
    requestContext.researchReferences = context.researchReferences;
  }

  if (Object.keys(requestContext).length === 0) {
    return undefined;
  }

  assign('timezone', context.timezone ?? timezone);

  return requestContext;
}
