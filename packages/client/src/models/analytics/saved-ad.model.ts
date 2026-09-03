import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ISavedAd } from '@genfeedai/contracts/interfaces';

export class SavedAd extends BaseEntity implements ISavedAd {
  declare public organizationId: string;
  declare public brandId: string;
  declare public userId: string;
  declare public source: ISavedAd['source'];
  declare public platform: ISavedAd['platform'];
  declare public sourceAdId: string;
  declare public sourceRecordId?: string | null;
  declare public channel: ISavedAd['channel'];
  declare public credentialId?: string | null;
  declare public adAccountId?: string | null;
  declare public loginCustomerId?: string | null;
  declare public advertiserId?: string | null;
  declare public advertiserName?: string | null;
  declare public title: string;
  declare public headline?: string | null;
  declare public body?: string | null;
  declare public cta?: string | null;
  declare public explanation: string;
  declare public landingPageUrl?: string | null;
  declare public previewUrl?: string | null;
  declare public imageUrls: string[];
  declare public videoUrls: string[];
  declare public metrics: Record<string, number>;
  declare public patternSummary: ISavedAd['patternSummary'];
  declare public usagePolicy: ISavedAd['usagePolicy'];
  declare public firstSeenAt?: string | null;
  declare public lastSeenAt?: string | null;
  declare public capturedAt: string;
  declare public note?: string | null;

  constructor(data: Partial<ISavedAd> = {}) {
    super(data);
  }
}
