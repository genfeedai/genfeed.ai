import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  IListeningEvidence,
  IListeningTopic,
  IListeningTopicSource,
} from '@genfeedai/contracts/interfaces';

export class ListeningTopicSource
  extends BaseEntity
  implements IListeningTopicSource
{
  declare public organizationId: string;
  declare public organization?: IListeningTopicSource['organization'];
  declare public brandId: string;
  declare public brand?: IListeningTopicSource['brand'];
  declare public topicId: string;
  declare public sourceId: string;
  declare public source?: IListeningTopicSource['source'];
  declare public platform: IListeningTopicSource['platform'];

  constructor(data: Partial<IListeningTopicSource> = {}) {
    super(data);
  }
}

export class ListeningTopic extends BaseEntity implements IListeningTopic {
  declare public organizationId: string;
  declare public organization?: IListeningTopic['organization'];
  declare public brandId: string;
  declare public brand?: IListeningTopic['brand'];
  declare public userId: string;
  declare public user?: IListeningTopic['user'];
  declare public label: string;
  declare public description?: string | null;
  declare public keywords: string[];
  declare public excludedKeywords: string[];
  declare public languages: string[];
  declare public freshnessHours: number;
  declare public fingerprint: string;
  declare public contractVersion: number;
  declare public isActive: boolean;
  declare public auditedAt: string;
  declare public lastCollectedAt?: string | null;
  declare public sources: IListeningTopicSource[];

  constructor(data: Partial<IListeningTopic> = {}) {
    super(data);
  }
}

export class ListeningEvidence
  extends BaseEntity
  implements IListeningEvidence
{
  declare public organizationId: string;
  declare public organization?: IListeningEvidence['organization'];
  declare public brandId: string;
  declare public brand?: IListeningEvidence['brand'];
  declare public topicId: string;
  declare public topic?: IListeningEvidence['topic'];
  declare public topicSourceId: string;
  declare public topicSource?: IListeningEvidence['topicSource'];
  declare public sourcePostId?: string | null;
  declare public sourcePost?: IListeningEvidence['sourcePost'];
  declare public platform: IListeningEvidence['platform'];
  declare public externalId: string;
  declare public eventType: IListeningEvidence['eventType'];
  declare public sourceUrl?: string | null;
  declare public authorExternalId?: string | null;
  declare public authorHandle?: string | null;
  declare public contentExcerpt?: string | null;
  declare public occurredAt: string;
  declare public collectedAt: string;
  declare public freshnessExpiresAt: string;
  declare public contractVersion: number;
  declare public metrics: IListeningEvidence['metrics'];
  declare public metadata: Record<string, unknown>;

  constructor(data: Partial<IListeningEvidence> = {}) {
    super(data);
  }
}
