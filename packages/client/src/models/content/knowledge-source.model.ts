import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  KnowledgeMemoryScope,
  KnowledgeProcessingState,
  KnowledgeRetentionPolicy,
  KnowledgeRetentionState,
  KnowledgeRetrievalState,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import type {
  KnowledgeSourceRecord,
  KnowledgeSourceVersionRecord,
  KnowledgeSpaceMembershipRecord,
  KnowledgeSpaceRecord,
} from '@genfeedai/contracts/interfaces';

export class KnowledgeSource
  extends BaseEntity
  implements KnowledgeSourceRecord
{
  declare public organizationId: string;
  declare public brandId: string | null;
  declare public userId: string;
  declare public scope: KnowledgeMemoryScope;
  declare public title: string;
  declare public kind: KnowledgeSourceKind;
  declare public purpose: KnowledgeSourcePurpose;
  declare public isVisible: boolean;

  constructor(data: Partial<KnowledgeSourceRecord> = {}) {
    super(data);
  }
}

export class KnowledgeSourceVersion
  extends BaseEntity
  implements KnowledgeSourceVersionRecord
{
  declare public organizationId: string;
  declare public sourceId: string;
  declare public version: number;
  declare public contentHash: string;
  declare public provenance: Record<string, unknown> | null;
  declare public payload: Record<string, unknown> | null;
  declare public processingState: KnowledgeProcessingState;
  declare public processingError: string | null;
  declare public retrievalState: KnowledgeRetrievalState;
  declare public retentionState: KnowledgeRetentionState;
  declare public retentionPolicy: KnowledgeRetentionPolicy;
  declare public observedAt: string;
  declare public verifiedAt: string | null;
  declare public expiresAt: string | null;
  declare public purgeScheduledAt: string | null;
  declare public purgedAt: string | null;
  declare public supersededByVersionId: string | null;
  declare public isCurrent: boolean;

  constructor(data: Partial<KnowledgeSourceVersionRecord> = {}) {
    super(data);
  }
}

export class KnowledgeSpace extends BaseEntity implements KnowledgeSpaceRecord {
  declare public organizationId: string;
  declare public brandId: string | null;
  declare public userId: string;
  declare public scope: KnowledgeMemoryScope;
  declare public title: string;
  declare public isInbox: boolean;

  constructor(data: Partial<KnowledgeSpaceRecord> = {}) {
    super(data);
  }
}

export class KnowledgeSpaceMembership
  extends BaseEntity
  implements KnowledgeSpaceMembershipRecord
{
  declare public organizationId: string;
  declare public sourceId: string;
  declare public spaceId: string;

  constructor(data: Partial<KnowledgeSpaceMembershipRecord> = {}) {
    super(data);
  }
}
