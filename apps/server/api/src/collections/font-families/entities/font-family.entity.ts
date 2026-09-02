import { BaseEntity } from '@api/entities/base.entity';
import { ModelCategory } from '@genfeedai/contracts';
import { type FontFamilyRecord as FontFamily } from '@genfeedai/prisma';

export class FontFamilyEntity extends BaseEntity implements FontFamily {
  declare readonly organizationId: string | null;

  declare readonly key: string;
  declare readonly label: string;
  declare readonly description: string | null;
  declare readonly category?: ModelCategory;
}
