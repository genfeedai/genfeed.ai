import type { ElementStyle } from '@api/collections/elements/styles/schemas/style.schema';
import { BaseEntity } from '@api/entities/base.entity';
import type { ModelCategory } from '@genfeedai/enums';

export class ElementStyleEntity extends BaseEntity implements ElementStyle {
  declare readonly organizationId: string;

  declare readonly key: string;
  declare readonly label: string;
  declare readonly description: string | null;
  declare readonly models?: string[];
  declare readonly category?: ModelCategory | null;
}
