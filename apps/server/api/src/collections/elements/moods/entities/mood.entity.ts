import { BaseEntity } from '@api/entities/base.entity';
import { ModelCategory } from '@genfeedai/enums';
import { type ElementMood } from '@genfeedai/prisma';

export class ElementMoodEntity extends BaseEntity implements ElementMood {
  declare readonly organizationId: string;

  declare readonly key: string;
  declare readonly label: string;
  declare readonly description: string | null;
  declare readonly category?: ModelCategory;
}
