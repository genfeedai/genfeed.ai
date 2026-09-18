import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  KnowledgeMemoryScope,
  KnowledgeProcessingState,
  KnowledgeRetentionPolicy,
  KnowledgeRetentionState,
  KnowledgeRetrievalState,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
  KnowledgeSourceSyncState,
  KnowledgeTranscriptState,
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
  declare public mediaReferenceKey: string | null;
  declare public isRefreshEnabled: boolean;
  declare public refreshIntervalMinutes: number | null;
  declare public gracePeriodMinutes: number | null;
  declare public refreshWorkflowId: string | null;
  declare public referenceUrl: string | null;
  declare public syncState: KnowledgeSourceSyncState | null;
  declare public lastCheckedAt: string | null;
  declare public lastSuccessfulSyncAt: string | null;
  declare public nextCheckAt: string | null;
  declare public firstFailureAt: string | null;
  declare public consecutiveFailures: number;
  declare public staleAt: string | null;
  declare public lastSyncError: string | null;

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
  declare public transcriptState: KnowledgeTranscriptState | null;

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
