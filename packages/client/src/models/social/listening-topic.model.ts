import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  IListeningEvidence,
  IListeningTopic,
  IListeningTopicSource,
} from '@genfeedai/interfaces';

export class ListeningTopicSource
  extends BaseEntity
  implements IListeningTopicSource
{
  public declare organizationId: string;
  public declare organization?: IListeningTopicSource['organization'];
  public declare brandId: string;
  public declare brand?: IListeningTopicSource['brand'];
  public declare topicId: string;
  public declare sourceId: string;
  public declare source?: IListeningTopicSource['source'];
  public declare platform: IListeningTopicSource['platform'];

  constructor(data: Partial<IListeningTopicSource> = {}) {
    super(data);
  }
}

export class ListeningTopic extends BaseEntity implements IListeningTopic {
  public declare organizationId: string;
  public declare organization?: IListeningTopic['organization'];
  public declare brandId: string;
  public declare brand?: IListeningTopic['brand'];
  public declare userId: string;
  public declare user?: IListeningTopic['user'];
  public declare label: string;
  public declare description?: string | null;
  public declare keywords: string[];
  public declare excludedKeywords: string[];
  public declare languages: string[];
  public declare freshnessHours: number;
  public declare fingerprint: string;
  public declare contractVersion: number;
  public declare isActive: boolean;
  public declare auditedAt: string;
  public declare lastCollectedAt?: string | null;
  public declare sources: IListeningTopicSource[];

  constructor(data: Partial<IListeningTopic> = {}) {
    super(data);
  }
}

export class ListeningEvidence
  extends BaseEntity
  implements IListeningEvidence
{
  public declare organizationId: string;
  public declare organization?: IListeningEvidence['organization'];
  public declare brandId: string;
  public declare brand?: IListeningEvidence['brand'];
  public declare topicId: string;
  public declare topic?: IListeningEvidence['topic'];
  public declare topicSourceId: string;
  public declare topicSource?: IListeningEvidence['topicSource'];
  public declare sourcePostId?: string | null;
  public declare sourcePost?: IListeningEvidence['sourcePost'];
  public declare platform: IListeningEvidence['platform'];
  public declare externalId: string;
  public declare eventType: IListeningEvidence['eventType'];
  public declare sourceUrl?: string | null;
  public declare authorExternalId?: string | null;
  public declare authorHandle?: string | null;
  public declare contentExcerpt?: string | null;
  public declare occurredAt: string;
  public declare collectedAt: string;
  public declare freshnessExpiresAt: string;
  public declare contractVersion: number;
  public declare metrics: IListeningEvidence['metrics'];
  public declare metadata: Record<string, unknown>;

  constructor(data: Partial<IListeningEvidence> = {}) {
    super(data);
  }
}
