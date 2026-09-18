import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/contracts/constants';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';

type CharacterMentionLookup = {
  listCharacterMentions: (input: {
    brandId?: string;
    organizationId: string;
  }) => Promise<Array<{ avatarIngredientId?: string; handle: string }>>;
};

export function readMediaReferenceStrings(
  value: unknown,
  max: number,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, max);
}

export function capMediaReferences(
  references: string[],
  modelKey?: string,
): string[] {
  const catalogLimit =
    modelKey && modelKey in MODEL_OUTPUT_CAPABILITIES
      ? MODEL_OUTPUT_CAPABILITIES[
          modelKey as keyof typeof MODEL_OUTPUT_CAPABILITIES
        ].maxReferences
      : undefined;
  const cap =
    typeof catalogLimit === 'number' && catalogLimit > 0
      ? Math.min(8, catalogLimit)
      : 8;
  return references.slice(0, cap);
}

export async function resolveGenerationReferences(params: {
  attachmentFallback?: string;
  ctx: ToolExecutionContext;
  explicitReferences?: unknown;
  handles?: unknown;
  modelKey?: string;
  personasService?: CharacterMentionLookup;
}): Promise<{ error?: AgentToolResult; references: string[] }> {
  const handles = readMediaReferenceStrings(params.handles, 4);
  const explicit = readMediaReferenceStrings(params.explicitReferences, 8);
  const unresolved: string[] = [];
  const resolved: string[] = [];

  if (handles.length > 0) {
    if (!params.personasService) {
      return {
        error: {
          creditsUsed: 0,
          error: `Unresolved character handles: ${handles.join(', ')}`,
          success: false,
        },
        references: [],
      };
    }
    const characters = await params.personasService.listCharacterMentions({
      brandId: params.ctx.brandId,
      organizationId: params.ctx.organizationId,
    });
    const byHandle = new Map(
      characters.map((character) => [character.handle, character]),
    );
    for (const handle of handles) {
      const character = byHandle.get(handle.toLowerCase());
      if (!character?.avatarIngredientId) {
        unresolved.push(handle);
        continue;
      }
      resolved.push(character.avatarIngredientId);
    }
  }

  if (unresolved.length > 0) {
    return {
      error: {
        creditsUsed: 0,
        data: { unresolvedHandles: unresolved },
        error: `Unresolved character handles: ${unresolved.join(', ')}`,
        success: false,
      },
      references: [],
    };
  }

  const merged: string[] = [];
  const seen = new Set<string>();
  for (const id of [
    ...resolved,
    ...explicit,
    ...(params.attachmentFallback ? [params.attachmentFallback] : []),
  ]) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    merged.push(id);
  }

  return { references: capMediaReferences(merged, params.modelKey) };
}
