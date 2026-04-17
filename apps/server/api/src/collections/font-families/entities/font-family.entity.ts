import { FontFamily } from '@api/collections/font-families/schemas/font-family.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { ModelCategory } from '@genfeedai/enums';

export class FontFamilyEntity extends BaseEntity implements FontFamily {
  declare readonly user: string;
  declare readonly organization: string;

  declare readonly key: string;
  declare readonly label: string;
  declare readonly description?: string;
  declare readonly category?: ModelCategory;
}
