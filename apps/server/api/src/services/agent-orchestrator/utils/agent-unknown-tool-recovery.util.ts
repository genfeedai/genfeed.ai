import {
  type GenerationRedirect,
  inferPrepareGenerationType,
  isIdentityGenerationToolName,
} from '@api/services/agent-orchestrator/utils/agent-generation-prepare-redirect.util';
import {
  MEDIA_GENERATION_TOOL_NAME,
  MEDIA_GENERATION_TYPE_PARAMETERS,
} from '@genfeedai/actions';

/**
 * Rewrites the arguments of an unknown or direct generation tool call so the
 * redirected tool accepts them.
 */
export function buildUnknownToolRecoveryParams(
  requestedToolName: string,
  toolParams: Record<string, unknown>,
  redirect: GenerationRedirect,
): Record<string, unknown> {
  if (redirect.toolName === MEDIA_GENERATION_TOOL_NAME) {
    // `generate` is strict per type; drop the per-kind aliases models send.
    const {
      description,
      generationType: _generationType,
      text,
      useIdentity: _useIdentity,
      ...rest
    } = toolParams;
    // A composer-mode redirect can change the type; keep only the fields
    // the resolved type accepts so the call is not rejected for them.
    const accepted = redirect.mediaType
      ? MEDIA_GENERATION_TYPE_PARAMETERS[redirect.mediaType]
      : undefined;
    const applicable = accepted
      ? Object.fromEntries(
          Object.entries(rest).filter(([key]) => accepted.has(key)),
        )
      : rest;
    return {
      ...applicable,
      prompt:
        (typeof rest.prompt === 'string' && rest.prompt) ||
        (typeof description === 'string' && description) ||
        (typeof text === 'string' && text) ||
        '',
      type: redirect.mediaType,
    };
  }

  const generationType = inferPrepareGenerationType(requestedToolName);
  const recovered = generationType
    ? {
        ...toolParams,
        generationType,
        prompt:
          (toolParams.prompt as string | undefined) ||
          (toolParams.description as string | undefined) ||
          (toolParams.text as string | undefined) ||
          '',
      }
    : toolParams;

  if (!isIdentityGenerationToolName(requestedToolName)) {
    return recovered;
  }

  return { ...recovered, useIdentity: true };
}
