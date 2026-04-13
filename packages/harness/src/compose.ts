import type { HarnessPackRegistry } from './registry';
import type {
  ContentHarnessBrief,
  ContentHarnessContribution,
  ContentHarnessInput,
} from './types';

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

export async function composeContentHarnessBrief(
  registry: HarnessPackRegistry,
  input: ContentHarnessInput,
): Promise<ContentHarnessBrief> {
  let aggregate: ContentHarnessContribution = {
    evaluationCriteria: [],
    guardrails: [],
    providerHints: [],
    sources: [],
    styleDirectives: [],
    systemDirectives: [],
  };

  const packs = registry.list();
  for (const pack of packs) {
    if (!pack.contribute) {
      continue;
    }

    const contribution = await pack.contribute(input);
    aggregate = mergeContribution(aggregate, contribution);
  }

  return {
    evaluationCriteria: aggregate.evaluationCriteria ?? [],
    guardrails: aggregate.guardrails ?? [],
    metadata: {
      brandId: input.brandId,
      brandName: input.brandName,
      contentType: input.intent.contentType,
      objective: input.intent.objective,
      platform: input.intent.platform,
    },
    packs: packs.map((pack) => pack.id),
    providerHints: aggregate.providerHints ?? [],
    sources: aggregate.sources ?? [],
    styleDirectives: aggregate.styleDirectives ?? [],
    systemDirectives: aggregate.systemDirectives ?? [],
  };
}
