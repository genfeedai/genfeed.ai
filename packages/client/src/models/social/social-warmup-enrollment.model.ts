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
  declare public organizationId: string;
  declare public organization?: ISocialWarmupEvent['organization'];
  declare public brandId: string;
  declare public brand?: ISocialWarmupEvent['brand'];
  declare public enrollmentId: string;
  declare public itemId: string;
  declare public provenance: ISocialWarmupEvent['provenance'];
  declare public actorUserId: string;
  declare public actorUser?: ISocialWarmupEvent['actorUser'];
  declare public action: ISocialWarmupEvent['action'];
  declare public occurredAt: string;

  constructor(data: Partial<ISocialWarmupEvent> = {}) {
    super(data);
  }
}

export class SocialWarmupSignal
  extends BaseEntity
  implements ISocialWarmupSignal
{
  declare public organizationId: string;
  declare public organization?: ISocialWarmupSignal['organization'];
  declare public brandId: string;
  declare public brand?: ISocialWarmupSignal['brand'];
  declare public enrollmentId: string;
  declare public key: string;
  declare public observedAt?: string | null;
  declare public staleAt?: string | null;
  declare public status: ISocialWarmupSignal['status'];
  declare public source: ISocialWarmupSignal['source'];
  declare public evidence: ISocialWarmupSignal['evidence'];

  constructor(data: Partial<ISocialWarmupSignal> = {}) {
    super(data);
  }
}

export class SocialWarmupEnrollment
  extends BaseEntity
  implements ISocialWarmupEnrollment
{
  declare public organizationId: string;
  declare public organization?: ISocialWarmupEnrollment['organization'];
  declare public brandId: string;
  declare public brand?: ISocialWarmupEnrollment['brand'];
  declare public credentialId: string;
  declare public blueprintId: string;
  declare public blueprintVersion: number;
  declare public startedAt: string;
  declare public currentPhaseId: string;
  declare public state: ISocialWarmupEnrollment['state'];
  declare public enrolledByUserId: string;
  declare public enrolledByUser?: ISocialWarmupEnrollment['enrolledByUser'];
  declare public events: ISocialWarmupEvent[];
  declare public signals: ISocialWarmupSignal[];
  declare public completedItemIds: string[];
  declare public reconnect?: ISocialWarmupEnrollment['reconnect'];
  declare public isCredentialConnected: boolean;
  declare public hasPartialScopes: boolean;

  constructor(data: Partial<ISocialWarmupEnrollment> = {}) {
    super(data);
  }
}
