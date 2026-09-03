import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  IMoodBoard,
  IMoodBoardLayoutItem,
} from '@genfeedai/contracts/interfaces';

export class MoodBoard extends BaseEntity implements IMoodBoard {
  declare public brandId: string;
  declare public organizationId: string;
  declare public layout: IMoodBoardLayoutItem[];
  declare public metadata?: Record<string, unknown>;

  constructor(data: Partial<IMoodBoard> = {}) {
    super(data);
  }
}
