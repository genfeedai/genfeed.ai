import type { MemberRole } from '@genfeedai/contracts';

export interface KnowledgeActor {
  organizationId: string;
  userId: string;
  brandId?: string;
  /** When true, list/read omit personal Knowledge and keep brand + org rows. */
  isWorkflowScoped?: boolean;
  role?: MemberRole | string;
}
