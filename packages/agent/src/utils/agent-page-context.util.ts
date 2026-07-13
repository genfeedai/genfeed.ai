import type { AgentPageContext as AgentRequestPageContext } from '@genfeedai/agent/models/agent-chat.model';
import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';

export interface AgentPageContextState extends AgentRequestPageContext {
  placeholder?: string;
  route: string;
  suggestedActions: SuggestedAction[];
}

function hasContextValue(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function toAgentRequestPageContext(
  context: AgentPageContextState | null | undefined,
): AgentRequestPageContext | undefined {
  if (!context) {
    return undefined;
  }

  const requestContext: AgentRequestPageContext = {};

  const assign = (
    key: keyof AgentRequestPageContext,
    value: string | undefined,
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

  if (context.analyticsQuery?.kind === 'analytics-query') {
    requestContext.analyticsQuery = context.analyticsQuery;
  }

  return Object.keys(requestContext).length > 0 ? requestContext : undefined;
}
