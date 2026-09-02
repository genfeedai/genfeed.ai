import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { IRssSource } from '@genfeedai/contracts/interfaces';

export class RssSource extends BaseEntity implements IRssSource {
  public declare approvalMode: IRssSource['approvalMode'];
  public declare brand?: IRssSource['brand'];
  public declare brandId?: string | null;
  public declare failedCount: number;
  public declare feedUrl: string;
  public declare importedCount: number;
  public declare importPolicy: IRssSource['importPolicy'];
  public declare isEnabled: boolean;
  public declare label: string;
  public declare lastError?: string | null;
  public declare lastPolledAt?: string | null;
  public declare organization?: IRssSource['organization'];
  public declare organizationId: string;
  public declare skippedCount: number;
  public declare targetChannels: IRssSource['targetChannels'];
  public declare timezone: string;
  public declare user?: IRssSource['user'];
  public declare userId: string;

  constructor(data: Partial<IRssSource> = {}) {
    super(data);
  }
}
