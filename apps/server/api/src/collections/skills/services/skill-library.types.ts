import type { Prisma } from '@genfeedai/prisma';

export interface SkillLibraryActor {
  brandId?: string | null;
  organizationId: string;
  userId: string;
}

export interface PinnedSkillExecution {
  contentHash: string;
  skillId: string;
  skillVersionId: string;
}

export interface SkillRow {
  audience: string | null;
  brandId: string | null;
  config: Prisma.JsonValue;
  currentVersionId: string | null;
  id: string;
  isDeleted: boolean;
  isQuarantined: boolean;
  label: string | null;
  organizationId: string | null;
  ownerKind: string | null;
  ownerUserId: string | null;
  publishedVersionId: string | null;
  revision: number;
  sharedVersionId: string | null;
}
