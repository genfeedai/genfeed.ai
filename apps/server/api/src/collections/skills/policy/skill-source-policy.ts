import {
  CLOSED_SKILL_SOURCE_POLICY,
  PUBLIC_FREE_SOURCE_POLICY,
  type SkillCapabilitySubject,
  type SkillSourcePolicy,
} from '@api/collections/skills/policy/skill-capabilities';
import type { SkillDocument } from '@api/collections/skills/schemas/skill.schema';

const AUTHORED_POLICY: SkillSourcePolicy = {
  allowsDerivatives: true,
  allowsExport: true,
  allowsPublicPublication: true,
  allowsRead: true,
  allowsShare: true,
};

export function resolveSkillSourcePolicy(
  subject: SkillCapabilitySubject,
  document: SkillDocument,
): SkillSourcePolicy {
  if (subject.ownerKind === 'system' || document.isBuiltIn === true) {
    return {
      ...PUBLIC_FREE_SOURCE_POLICY,
      allowsDerivatives: true,
      allowsExport: subject.ownerKind === 'system',
      allowsPublicPublication: false,
      allowsShare: false,
    };
  }
  if (document.source === 'imported') {
    if (
      !document.config ||
      typeof document.config !== 'object' ||
      Array.isArray(document.config)
    )
      return CLOSED_SKILL_SOURCE_POLICY;
    const config = document.config as Record<string, unknown>;
    const provenance = config.importProvenance;
    if (
      subject.ownerKind === 'user' &&
      subject.ownerUserId &&
      !subject.organizationId &&
      !subject.brandId &&
      !config.sourceListingId &&
      provenance &&
      typeof provenance === 'object' &&
      !Array.isArray(provenance)
    ) {
      const recorded = provenance as Record<string, unknown>;
      if (
        recorded.format === 'genfeed.skill.ordinary-upload.v1' &&
        recorded.importedByUserId === subject.ownerUserId &&
        typeof recorded.packageChecksum === 'string' &&
        /^[a-f0-9]{64}$/.test(recorded.packageChecksum) &&
        config.checksum === recorded.packageChecksum
      ) {
        return { ...AUTHORED_POLICY, allowsPublicPublication: false };
      }
    }
    return CLOSED_SKILL_SOURCE_POLICY;
  }
  return AUTHORED_POLICY;
}
