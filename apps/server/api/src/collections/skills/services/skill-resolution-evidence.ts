export interface RecordedSkillVersion {
  contentHash: string;
  skillId: string;
  skillVersionId: string;
}

export interface RecordedSkillExclusion {
  contentHash?: string;
  reason: string;
  skillId: string;
  skillVersionId?: string;
}

export function resolutionItems(
  included: readonly RecordedSkillVersion[],
  excluded: readonly RecordedSkillExclusion[],
) {
  return [
    ...included.map((version) => ({
      contentHash: version.contentHash,
      exclusionReason: null,
      inclusion: 'included',
      origin: 'selection',
      skillId: version.skillId,
      skillVersionId: version.skillVersionId,
    })),
    ...excluded.flatMap((item) => {
      if (!item.contentHash || !item.skillVersionId) return [];
      return [
        {
          contentHash: item.contentHash,
          exclusionReason: item.reason,
          inclusion: 'excluded',
          origin: 'selection',
          skillId: item.skillId,
          skillVersionId: item.skillVersionId,
        },
      ];
    }),
  ];
}
