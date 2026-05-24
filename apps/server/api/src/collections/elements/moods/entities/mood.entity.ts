import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { ModelCategory } from '@genfeedai/enums';
import { type ElementMood } from '@genfeedai/prisma';

export class ElementMoodEntity extends BaseEntity implements ElementMood {
  declare readonly user?: string;
  declare readonly organization?: string;

  declare readonly key: string;
  declare readonly label: string;
  declare readonly description: string | null;
  declare readonly category?: ModelCategory;
}
