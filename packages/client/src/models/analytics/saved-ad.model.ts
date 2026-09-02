import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ISavedAd } from '@genfeedai/contracts/interfaces';

export class SavedAd extends BaseEntity implements ISavedAd {
  public declare organizationId: string;
  public declare brandId: string;
  public declare userId: string;
  public declare source: ISavedAd['source'];
  public declare platform: ISavedAd['platform'];
  public declare sourceAdId: string;
  public declare sourceRecordId?: string | null;
  public declare channel: ISavedAd['channel'];
  public declare credentialId?: string | null;
  public declare adAccountId?: string | null;
  public declare loginCustomerId?: string | null;
  public declare advertiserId?: string | null;
  public declare advertiserName?: string | null;
  public declare title: string;
  public declare headline?: string | null;
  public declare body?: string | null;
  public declare cta?: string | null;
  public declare explanation: string;
  public declare landingPageUrl?: string | null;
  public declare previewUrl?: string | null;
  public declare imageUrls: string[];
  public declare videoUrls: string[];
  public declare metrics: Record<string, number>;
  public declare patternSummary: ISavedAd['patternSummary'];
  public declare usagePolicy: ISavedAd['usagePolicy'];
  public declare firstSeenAt?: string | null;
  public declare lastSeenAt?: string | null;
  public declare capturedAt: string;
  public declare note?: string | null;

  constructor(data: Partial<ISavedAd> = {}) {
    super(data);
  }
}
