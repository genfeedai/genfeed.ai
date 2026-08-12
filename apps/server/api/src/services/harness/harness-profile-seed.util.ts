/**
 * Pure mapping from private/OSS harness pack seeds into harness-profile payloads.
 * Used by seed scripts and unit tests — no Nest / Prisma imports.
 */

export type HarnessPackSeed = {
  antiExamples?: string[];
  audienceHint?: string;
  brandIds?: string[];
  brandName: string;
  brandSlugs?: string[];
  doNotSoundLike?: string[];
  evaluationCriteria?: string[];
  examples?: string[];
  guardrails?: string[];
  handles?: string[];
  id: string;
  offer?: string;
  styleDirectives?: string[];
  systemDirectives?: string[];
  topics?: string[];
};

export type BrandSeedMatch = {
  id: string;
  label?: string | null;
  slug?: string | null;
};

export type HarnessProfileSeedPayload = {
  audience: string[];
  brandId: string;
  description: string;
  examples: { avoid: string[]; good: string[] };
  guardrails: string[];
  handles: Record<string, string>;
  isDefault: boolean;
  label: string;
  platforms: string[];
  scope: 'brand';
  status: 'active';
  thesis: {
    beliefs: string[];
    offers: string[];
  };
  voice: {
    bannedPhrases: string[];
    style?: string;
    tone?: string;
  };
};

function isUsableExample(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  // Skip placeholder TODOs so seeds never pollute production profiles.
  if (/^TODO\b/i.test(trimmed)) {
    return false;
  }
  return true;
}

export function packSeedMatchesBrand(
  seed: HarnessPackSeed,
  brand: BrandSeedMatch,
): boolean {
  if (seed.brandIds?.includes(brand.id)) {
    return true;
  }

  const slug = brand.slug?.trim().toLowerCase();
  if (slug && seed.brandSlugs?.some((item) => item.toLowerCase() === slug)) {
    return true;
  }

  const label = brand.label?.trim().toLowerCase();
  if (label && seed.brandName.trim().toLowerCase() === label) {
    return true;
  }

  return false;
}

export function packSeedToProfilePayload(
  seed: HarnessPackSeed,
  brandId: string,
): HarnessProfileSeedPayload {
  const good = (seed.examples ?? []).filter(isUsableExample);
  const avoid = (seed.antiExamples ?? []).filter(isUsableExample);
  const banned = seed.doNotSoundLike ?? [];
  const handles = Object.fromEntries(
    (seed.handles ?? []).map((handle, index) => [
      `handle${index + 1}`,
      handle.startsWith('@') ? handle : `@${handle}`,
    ]),
  );

  const guardrails = [
    ...(seed.guardrails ?? []),
    ...banned.map((value) => `Do not sound like: ${value}.`),
  ];

  return {
    audience: seed.audienceHint ? [seed.audienceHint] : [],
    brandId,
    description: `Seeded from harness pack ${seed.id}`,
    examples: {
      avoid,
      good,
    },
    guardrails,
    handles,
    isDefault: true,
    label: `${seed.brandName} harness`,
    platforms: [],
    scope: 'brand',
    status: 'active',
    thesis: {
      beliefs: seed.systemDirectives ?? [],
      offers: seed.offer ? [seed.offer] : [],
    },
    voice: {
      bannedPhrases: banned,
      style: seed.styleDirectives?.[0],
      tone: seed.styleDirectives?.[1],
    },
  };
}

/**
 * Merge seed examples into an existing profile without wiping operator edits.
 * New seed examples append when not already present (case-insensitive).
 */
export function mergeSeedIntoExistingExamples(
  existing: { avoid?: string[]; good?: string[] } | undefined,
  seed: HarnessPackSeed,
): { avoid: string[]; good: string[] } {
  const existingGood = existing?.good ?? [];
  const existingAvoid = existing?.avoid ?? [];
  const seedGood = (seed.examples ?? []).filter(isUsableExample);
  const seedAvoid = (seed.antiExamples ?? []).filter(isUsableExample);

  const merge = (base: string[], extra: string[]): string[] => {
    const seen = new Set(base.map((item) => item.toLowerCase()));
    const next = [...base];
    for (const item of extra) {
      const key = item.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      next.push(item);
    }
    return next;
  };

  return {
    avoid: merge(existingAvoid, seedAvoid),
    good: merge(existingGood, seedGood),
  };
}
