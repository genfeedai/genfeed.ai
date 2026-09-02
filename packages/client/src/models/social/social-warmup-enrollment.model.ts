import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  ISocialWarmupEnrollment,
  ISocialWarmupEvent,
  ISocialWarmupSignal,
} from '@genfeedai/contracts/interfaces';

export class SocialWarmupEvent
  extends BaseEntity
  implements ISocialWarmupEvent
{
  public declare organizationId: string;
  public declare organization?: ISocialWarmupEvent['organization'];
  public declare brandId: string;
  public declare brand?: ISocialWarmupEvent['brand'];
  public declare enrollmentId: string;
  public declare itemId: string;
  public declare provenance: ISocialWarmupEvent['provenance'];
  public declare actorUserId: string;
  public declare actorUser?: ISocialWarmupEvent['actorUser'];
  public declare action: ISocialWarmupEvent['action'];
  public declare occurredAt: string;

  constructor(data: Partial<ISocialWarmupEvent> = {}) {
    super(data);
  }
}

export class SocialWarmupSignal
  extends BaseEntity
  implements ISocialWarmupSignal
{
  public declare organizationId: string;
  public declare organization?: ISocialWarmupSignal['organization'];
  public declare brandId: string;
  public declare brand?: ISocialWarmupSignal['brand'];
  public declare enrollmentId: string;
  public declare key: string;
  public declare observedAt?: string | null;
  public declare staleAt?: string | null;
  public declare status: ISocialWarmupSignal['status'];
  public declare source: ISocialWarmupSignal['source'];
  public declare evidence: ISocialWarmupSignal['evidence'];

  constructor(data: Partial<ISocialWarmupSignal> = {}) {
    super(data);
  }
}

export class SocialWarmupEnrollment
  extends BaseEntity
  implements ISocialWarmupEnrollment
{
  public declare organizationId: string;
  public declare organization?: ISocialWarmupEnrollment['organization'];
  public declare brandId: string;
  public declare brand?: ISocialWarmupEnrollment['brand'];
  public declare credentialId: string;
  public declare blueprintId: string;
  public declare blueprintVersion: number;
  public declare startedAt: string;
  public declare currentPhaseId: string;
  public declare state: ISocialWarmupEnrollment['state'];
  public declare enrolledByUserId: string;
  public declare enrolledByUser?: ISocialWarmupEnrollment['enrolledByUser'];
  public declare events: ISocialWarmupEvent[];
  public declare signals: ISocialWarmupSignal[];
  public declare completedItemIds: string[];
  public declare reconnect?: ISocialWarmupEnrollment['reconnect'];
  public declare isCredentialConnected: boolean;
  public declare hasPartialScopes: boolean;

  constructor(data: Partial<ISocialWarmupEnrollment> = {}) {
    super(data);
  }
}
