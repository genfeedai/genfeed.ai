import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  isFlux3ImageModel,
  MODEL_OUTPUT_CAPABILITIES,
} from '@genfeedai/contracts/constants';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';

type CharacterHandleLookup = {
  resolveCharacterHandles: (input: {
    brandId?: string | null;
    handles: readonly string[];
    organizationId: string;
  }) => Promise<{
    resolvedIngredientIds: readonly string[];
    unresolvedHandles: readonly string[];
  }>;
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

/** Most reference images the agent sends to the model. */
export function maxMediaReferences(modelKey?: string): number {
  const catalogLimit =
    modelKey && modelKey in MODEL_OUTPUT_CAPABILITIES
      ? MODEL_OUTPUT_CAPABILITIES[
          modelKey as keyof typeof MODEL_OUTPUT_CAPABILITIES
        ].maxReferences
      : undefined;
  return typeof catalogLimit === 'number' && catalogLimit > 0
    ? Math.min(modelKey && isFlux3ImageModel(modelKey) ? 10 : 8, catalogLimit)
    : 8;
}

export function capMediaReferences(
  references: string[],
  modelKey?: string,
): string[] {
  return references.slice(0, maxMediaReferences(modelKey));
}

export async function resolveGenerationReferences(params: {
  attachmentFallback?: string;
  ctx: ToolExecutionContext;
  explicitReferences?: unknown;
  handles?: unknown;
  modelKey?: string;
  personasService?: CharacterHandleLookup;
}): Promise<{ error?: AgentToolResult; references: string[] }> {
  const handles = readMediaReferenceStrings(params.handles, 4);
  const flux = params.modelKey && isFlux3ImageModel(params.modelKey);
  if (
    flux &&
    Array.isArray(params.explicitReferences) &&
    (params.explicitReferences.length > 10 ||
      params.explicitReferences.some(
        (value) => typeof value !== 'string' || !value.trim(),
      ))
  )
    return {
      error: {
        success: false,
        creditsUsed: 0,
        error: 'FLUX.3 accepts at most ten owned Library image IDs.',
      },
      references: [],
    };
  const explicit = readMediaReferenceStrings(
    params.explicitReferences,
    flux ? 10 : 8,
  );
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
    const resolvedHandles =
      await params.personasService.resolveCharacterHandles({
        brandId: params.ctx.brandId,
        handles,
        organizationId: params.ctx.organizationId,
      });
    unresolved.push(...resolvedHandles.unresolvedHandles);
    resolved.push(...resolvedHandles.resolvedIngredientIds);
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

  // Character references first (handles in order, each handle's references
  // in position order), then explicit ids, then the attachment; deduped,
  // keeping the first occurrence.
  const characterReferences = [...new Set(resolved)];
  const supplied = [
    ...new Set([
      ...explicit,
      ...(params.attachmentFallback ? [params.attachmentFallback] : []),
    ]),
  ].filter((id) => !characterReferences.includes(id));

  // A character can hold more references than the model accepts. The
  // caller-supplied images and one reference per handle must fit; the extra
  // character references fill the remaining slots, earlier handles first.
  // With one reference per character this is the previous behaviour.
  const requiredCharacterCount = Math.min(
    characterReferences.length,
    handles.length,
  );
  if (flux && requiredCharacterCount + supplied.length > 10)
    return {
      error: {
        success: false,
        creditsUsed: 0,
        error: 'FLUX.3 accepts at most ten combined source images.',
      },
      references: [],
    };
  const characterBudget = Math.max(
    maxMediaReferences(params.modelKey) - supplied.length,
    requiredCharacterCount,
  );
  return {
    references: capMediaReferences(
      [...characterReferences.slice(0, characterBudget), ...supplied],
      params.modelKey,
    ),
  };
}
