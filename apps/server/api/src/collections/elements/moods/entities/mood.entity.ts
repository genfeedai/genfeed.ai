import { ElementMood } from '@api/collections/elements/moods/schemas/mood.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { ModelCategory } from '@genfeedai/enums';

export class ElementMoodEntity extends BaseEntity implements ElementMood {
  declare readonly user?: string;
  declare readonly organization?: string;

  declare readonly key: string;
  declare readonly label: string;
  declare readonly description?: string;
  declare readonly category?: ModelCategory;
}
