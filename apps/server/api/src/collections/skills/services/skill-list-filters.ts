import type { SkillDocument } from '@api/collections/skills/schemas/skill.schema';
import type { SkillSurface } from '@genfeedai/contracts';
import { resolveSkillRunsOn } from '@genfeedai/helpers';

export interface ListSkillsOptions {
  /** Only skills the runtime injects while a brand has no explicit selection. */
  isDefault?: boolean;
  /** Narrow to skills that handle one modality (a `multi` skill matches when it is the only one). */
  modality?: string;
  /** Narrow to skills that run on web or on desktop. */
  runsOn?: string;
  /** Case-insensitive match over name and description. */
  search?: string;
  /** Narrow to one skill source. */
  source?: string;
  /** Narrow to one workflow stage. */
  stage?: string;
  /** Narrow the catalog to skills offered on one composer surface. */
  surface?: SkillSurface;
}

export function matchesSkillFilters(
  doc: SkillDocument,
  options: ListSkillsOptions,
): boolean {
  const { isDefault, modality, runsOn, search, source, stage } = options;
  const query = search?.trim().toLowerCase();
  const modalities = doc.modalities ?? [];

  return (
    (isDefault === undefined || Boolean(doc.isDefault) === isDefault) &&
    (!source || doc.source === source) &&
    (!runsOn || resolveSkillRunsOn(doc) === runsOn) &&
    (!stage || doc.workflowStage === stage) &&
    (!modality ||
      modalities.includes(modality) ||
      (modalities.length === 1 && modalities.includes('multi'))) &&
    (!query ||
      (doc.name ?? '').toLowerCase().includes(query) ||
      String(doc.description ?? '')
        .toLowerCase()
        .includes(query))
  );
}
