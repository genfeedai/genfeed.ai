import type { ElementStyle } from '@api/collections/elements/styles/schemas/style.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import type { ModelCategory } from '@genfeedai/enums';

export class ElementStyleEntity extends BaseEntity implements ElementStyle {
  declare readonly user?: string;
  declare readonly organization?: string;

  declare readonly key: string;
  declare readonly label: string;
  declare readonly description?: string;
  declare readonly models?: string[];
  declare readonly category?: ModelCategory | null;
}
