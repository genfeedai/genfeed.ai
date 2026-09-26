import { resolveImageGenerationBriefSupport } from '@api/services/generation-brief/resolve-image-generation-brief-support';
import { resolveVideoGenerationBriefSupport } from '@api/services/generation-brief/resolve-video-generation-brief-support';
import { contestantSchema } from '../bench/schema';
import {
  type MediaContestant,
  type Medium,
  mediaContestantSchema,
} from './contracts';
import { resolveMediaModelFamily } from './families';

/**
 * Contestants come from the model registry. Every active model is a raw route;
 * a model with a registered generation-brief compiler also enters as a
 * compiled route (`isCompiled: true`), exactly as the bench registry names
 * `genfeed-compiled.<model>`. A compiled route can lose to its own raw model,
 * and the ladder must be able to say so.
 */

export interface RegistryMediaModel {
  key: string;
  label: string;
  cost: number;
  isActive: boolean;
  isLegacy: boolean;
}

export interface BuildContestantsOptions {
  medium: Medium;
  models: readonly RegistryMediaModel[];
  /** Restrict to these registry keys; empty means every active model. */
  onlyKeys: readonly string[];
  compiledFidelity: 'guided' | 'strict';
  addedAt: string;
}

function slugify(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveSupport(medium: Medium, key: string) {
  return medium === 'image'
    ? resolveImageGenerationBriefSupport(key)
    : resolveVideoGenerationBriefSupport(key);
}

export function buildMediaContestants(
  options: BuildContestantsOptions,
): MediaContestant[] {
  const only = new Set(options.onlyKeys);
  const selected = options.models.filter(
    (model) =>
      model.isActive &&
      !model.isLegacy &&
      (only.size === 0 || only.has(model.key)),
  );
  const missing = [...only].filter(
    (key) => !selected.some((model) => model.key === key),
  );
  if (missing.length > 0) {
    throw new Error(
      `Requested models are not active ${options.medium} registry entries: ${missing.join(', ')}`,
    );
  }

  const contestants: MediaContestant[] = [];
  for (const model of [...selected].sort((a, b) =>
    a.key.localeCompare(b.key),
  )) {
    const family = resolveMediaModelFamily(model.key);
    const slug = slugify(model.key);
    contestants.push(
      mediaContestantSchema.parse({
        contestant: contestantSchema.parse({
          addedAt: options.addedAt,
          id: `${family}.${slug}`,
          isCompiled: false,
          label: model.label,
          mediums: [options.medium],
          modelId: model.key,
          provider: family,
          retiredAt: null,
        }),
        creditsPerOutput: model.cost,
        family,
        registryKey: model.key,
        route: { kind: 'raw' },
      }),
    );

    const support = resolveSupport(options.medium, model.key);
    if (support.kind !== 'compile') continue;
    contestants.push(
      mediaContestantSchema.parse({
        contestant: contestantSchema.parse({
          addedAt: options.addedAt,
          id: `genfeed-compiled.${slug}`,
          isCompiled: true,
          label: `Genfeed compile → ${model.label}`,
          mediums: [options.medium],
          modelId: model.key,
          provider: 'genfeed',
          retiredAt: null,
        }),
        creditsPerOutput: model.cost,
        family,
        registryKey: model.key,
        route: {
          compilerId: support.compilerId,
          compilerVersion: support.compilerVersion,
          fidelityMode: options.compiledFidelity,
          kind: 'compiled',
          profileId: support.profileId,
          profileVersion: support.profileVersion,
        },
      }),
    );
  }
  return contestants;
}
