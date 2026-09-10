import type { MemberRole } from '@genfeedai/contracts';

export interface KnowledgeActor {
  organizationId: string;
  userId: string;
  brandId?: string;
  role?: MemberRole | string;
}
