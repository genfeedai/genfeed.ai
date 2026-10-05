import type { HarnessPackRegistry } from '@genfeedai/contracts/interfaces/ai/harness-pack-registry.interface';
import type {
  ComposeContentHarnessBriefOptions,
  ContentHarnessBrief,
  ContentHarnessContribution,
  ContentHarnessInput,
  ContentHarnessPack,
  ContentHarnessSurface,
} from './types';

export function isHarnessPackForSurface(
  pack: Pick<ContentHarnessPack, 'surfaces'>,
  surface: ContentHarnessSurface | undefined,
): boolean {
  return !surface || !pack.surfaces || pack.surfaces.includes(surface);
}

function mergeUnique(
  target: string[],
  values: string[] | undefined,
  seen: Set<string>,
): void {
  if (!values) {
    return;
  }

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    target.push(normalized);
  }
}

function mergeContribution(
  aggregate: ContentHarnessContribution,
  contribution: ContentHarnessContribution,
): ContentHarnessContribution {
  const systemSeen = new Set(aggregate.systemDirectives ?? []);
  const styleSeen = new Set(aggregate.styleDirectives ?? []);
  const guardrailSeen = new Set(aggregate.guardrails ?? []);
  const criteriaSeen = new Set(aggregate.evaluationCriteria ?? []);
  const hintSeen = new Set(aggregate.providerHints ?? []);
  const sourceIds = new Set(
    (aggregate.sources ?? []).map((source) => source.id),
  );

  const next: ContentHarnessContribution = {
    evaluationCriteria: [...(aggregate.evaluationCriteria ?? [])],
    guardrails: [...(aggregate.guardrails ?? [])],
    providerHints: [...(aggregate.providerHints ?? [])],
    sources: [...(aggregate.sources ?? [])],
    styleDirectives: [...(aggregate.styleDirectives ?? [])],
    systemDirectives: [...(aggregate.systemDirectives ?? [])],
  };

  mergeUnique(
    next.systemDirectives ?? [],
    contribution.systemDirectives,
    systemSeen,
  );
  mergeUnique(
    next.styleDirectives ?? [],
    contribution.styleDirectives,
    styleSeen,
  );
  mergeUnique(next.guardrails ?? [], contribution.guardrails, guardrailSeen);
  mergeUnique(
    next.evaluationCriteria ?? [],
    contribution.evaluationCriteria,
    criteriaSeen,
  );
  mergeUnique(next.providerHints ?? [], contribution.providerHints, hintSeen);

  for (const source of contribution.sources ?? []) {
    if (sourceIds.has(source.id)) {
      continue;
    }
    sourceIds.add(source.id);
    next.sources?.push(source);
  }

  return next;
}

function hasContribution(contribution: ContentHarnessContribution): boolean {
  return (
    [
      contribution.systemDirectives,
      contribution.styleDirectives,
      contribution.guardrails,
      contribution.evaluationCriteria,
      contribution.providerHints,
    ].some((values) => values?.some((value) => value.trim().length > 0)) ||
    (contribution.sources?.length ?? 0) > 0
  );
}

export async function composeContentHarnessBrief(
  registry: HarnessPackRegistry<ContentHarnessPack>,
  input: ContentHarnessInput,
  options?: ComposeContentHarnessBriefOptions,
): Promise<ContentHarnessBrief> {
  let aggregate: ContentHarnessContribution = {
    evaluationCriteria: [],
    guardrails: [],
    providerHints: [],
    sources: [],
    styleDirectives: [],
    systemDirectives: [],
  };

  if (input.identityContribution) {
    aggregate = mergeContribution(aggregate, input.identityContribution);
  }

  const packs = registry
    .list()
    .filter((pack) => isHarnessPackForSurface(pack, options?.surface));
  const appliedPacks: string[] = [];
  for (const pack of packs) {
    if (!pack.contribute) {
      continue;
    }

    const contribution = await pack.contribute(input);
    if (hasContribution(contribution)) {
      appliedPacks.push(pack.id);
    }
    aggregate = mergeContribution(aggregate, contribution);
  }

  if (input.learningContribution) {
    aggregate = mergeContribution(aggregate, input.learningContribution);
  }

  return {
    appliedPacks,
    evaluationCriteria: aggregate.evaluationCriteria ?? [],
    guardrails: aggregate.guardrails ?? [],
    metadata: {
      ...(input.learningDecisionId
        ? { learningDecisionId: input.learningDecisionId }
        : {}),
      brandId: input.brandId,
      brandName: input.brandName,
      contentType: input.intent.contentType,
      objective: input.intent.objective,
      platform: input.intent.platform,
    },
    packs: packs.map((pack) => pack.id),
    receipts: {
      ...(input.brandOsRevisionId
        ? {
            brandOs: 'approved' as const,
            brandOsRevisionId: input.brandOsRevisionId,
          }
        : { brandOs: 'none' as const }),
      ...(input.harnessProfileId
        ? { harnessProfileId: input.harnessProfileId }
        : {}),
    },
    providerHints: aggregate.providerHints ?? [],
    sources: aggregate.sources ?? [],
    styleDirectives: aggregate.styleDirectives ?? [],
    systemDirectives: aggregate.systemDirectives ?? [],
  };
}
