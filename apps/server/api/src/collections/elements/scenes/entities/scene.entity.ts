import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { ModelCategory } from '@genfeedai/enums';
import { type ElementScene } from '@genfeedai/prisma';

export class ElementSceneEntity extends BaseEntity implements ElementScene {
  declare readonly user?: string;
  declare readonly organization?: string;

  declare readonly key: string;
  declare readonly label: string;
  declare readonly description: string | null;
  declare readonly category?: ModelCategory | null;

  declare readonly isFavorite: boolean;
}
