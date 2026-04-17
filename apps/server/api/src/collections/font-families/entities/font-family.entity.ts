import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { ModelCategory } from '@genfeedai/enums';
import { type FontFamilyRecord as FontFamily } from '@genfeedai/prisma';

export class FontFamilyEntity extends BaseEntity implements FontFamily {
  declare readonly user: string;
  declare readonly organization: string;

  declare readonly key: string;
  declare readonly label: string;
  declare readonly description?: string;
  declare readonly category?: ModelCategory;
}
