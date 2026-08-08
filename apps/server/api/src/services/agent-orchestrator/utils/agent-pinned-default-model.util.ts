/**
 * Apply the user's durable chat default model when the client omits model.
 * Empty / whitespace defaultAgentModel means Auto — leave request.model unset
 * for registry / brand / subscription resolution.
 */
export function applyPinnedDefaultAgentModel<
  TRequest extends { model?: string },
>(request: TRequest, defaultAgentModel: string | null | undefined): TRequest {
  if (request.model?.trim()) {
    return request;
  }

  const pinned = defaultAgentModel?.trim();
  if (!pinned) {
    return request;
  }

  return { ...request, model: pinned };
}
