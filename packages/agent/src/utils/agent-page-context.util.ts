import {
  buildComposerModeInstruction,
  type ComposerMode,
} from '@genfeedai/agent/constants/composer-mode.constant';
import type { AgentPageContext as AgentRequestPageContext } from '@genfeedai/agent/models/agent-chat.model';
import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';

export interface AgentPageContextState extends AgentRequestPageContext {
  placeholder?: string;
  route: string;
  suggestedActions: SuggestedAction[];
}

export function mergeComposerModeIntoPageContext(
  base: AgentRequestPageContext | undefined,
  composerMode?: ComposerMode,
  generationModelKey?: string | null,
): AgentRequestPageContext | undefined {
  if (!composerMode || composerMode === 'chat') {
    return base;
  }

  const modeInstruction = buildComposerModeInstruction(
    composerMode,
    generationModelKey ?? null,
  );
  if (!modeInstruction) {
    return base;
  }

  const draftInstructions = [base?.draftInstructions, modeInstruction]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n');

  return {
    ...base,
    contentFormat: composerMode,
    draftInstructions,
  };
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
  | 'url';

export function toAgentRequestPageContext(
  context: AgentPageContextState | null | undefined,
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

  return Object.keys(requestContext).length > 0 ? requestContext : undefined;
}
