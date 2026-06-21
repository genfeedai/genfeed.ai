import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { IMoodBoard, IMoodBoardLayoutItem } from '@genfeedai/interfaces';

export class MoodBoard extends BaseEntity implements IMoodBoard {
  public declare brandId: string;
  public declare organizationId: string;
  public declare layout: IMoodBoardLayoutItem[];
  public declare metadata?: Record<string, unknown>;

  constructor(data: Partial<IMoodBoard> = {}) {
    super(data);
  }
}
