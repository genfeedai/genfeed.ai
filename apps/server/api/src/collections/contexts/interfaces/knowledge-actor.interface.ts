import type { MemberRole } from '@genfeedai/contracts';

export interface KnowledgeActor {
  isApiKey?: boolean;
  scopes?: string[];
  organizationId: string;
  userId: string;
  brandId?: string;
  /** When true, list/read omit personal Knowledge and keep brand + org rows. */
  isWorkflowScoped?: boolean;
  role?: MemberRole | string;
}
