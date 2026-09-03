import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { IRssSource } from '@genfeedai/contracts/interfaces';

export class RssSource extends BaseEntity implements IRssSource {
  declare public approvalMode: IRssSource['approvalMode'];
  declare public brand?: IRssSource['brand'];
  declare public brandId?: string | null;
  declare public failedCount: number;
  declare public feedUrl: string;
  declare public importedCount: number;
  declare public importPolicy: IRssSource['importPolicy'];
  declare public isEnabled: boolean;
  declare public label: string;
  declare public lastError?: string | null;
  declare public lastPolledAt?: string | null;
  declare public organization?: IRssSource['organization'];
  declare public organizationId: string;
  declare public skippedCount: number;
  declare public targetChannels: IRssSource['targetChannels'];
  declare public timezone: string;
  declare public user?: IRssSource['user'];
  declare public userId: string;

  constructor(data: Partial<IRssSource> = {}) {
    super(data);
  }
}
