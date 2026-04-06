import type { ElementStyle } from '@api/collections/elements/styles/schemas/style.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import type { ModelCategory } from '@genfeedai/enums';
import type { Types } from 'mongoose';

export class ElementStyleEntity extends BaseEntity implements ElementStyle {
  declare readonly user?: Types.ObjectId;
  declare readonly organization?: Types.ObjectId;

  declare readonly key: string;
  declare readonly label: string;
  declare readonly description?: string;
  declare readonly models?: string[];
  declare readonly category?: ModelCategory | null;
}
