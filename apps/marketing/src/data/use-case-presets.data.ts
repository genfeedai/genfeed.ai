import { getPresetPages, type PresetPage } from '@data/presets.data';
import {
  getUseCaseAudienceName,
  type UseCase,
  useCases,
} from '@data/use-cases.data';
import { PRESET_CATALOG } from '@genfeedai/contracts/constants/preset-catalog.constant';

/**
 * The link between an audience page and the preset pages that serve it. A use
 * case names presets by catalog key; both directions show only presets that
 * have a page, which means an example.
 */

/** Throws when a use case names a preset key the catalog does not have. */
export function assertUseCasePresetKeys(
  cases: readonly Pick<UseCase, 'presetKeys' | 'slug'>[],
  catalogKeys: readonly string[],
): void {
  for (const useCase of cases) {
    for (const key of useCase.presetKeys) {
      if (!catalogKeys.includes(key))
        throw new Error(
          `Use case "${useCase.slug}" names preset "${key}", which is not in the catalog`,
        );
    }
  }
}

assertUseCasePresetKeys(
  useCases,
  PRESET_CATALOG.map((preset) => preset.key),
);

/** The published presets a use case names, in the order it names them. */
export function getUseCasePresetPages(
  useCase: Pick<UseCase, 'presetKeys'>,
  pages: readonly PresetPage[] = getPresetPages(),
): PresetPage[] {
  return useCase.presetKeys.flatMap((key) =>
    pages.filter((page) => page.key === key),
  );
}

export interface PresetUseCaseLink {
  readonly audience: string;
  readonly slug: string;
}

/** The use cases that name a preset, for the "Used for" links on its page. */
export function getUseCasesForPreset(
  presetKey: string,
  cases: readonly UseCase[] = useCases,
): PresetUseCaseLink[] {
  return cases
    .filter((useCase) => useCase.presetKeys.includes(presetKey))
    .map((useCase) => ({
      audience: getUseCaseAudienceName(useCase),
      slug: useCase.slug,
    }));
}
