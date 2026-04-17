import { ElementScene } from '@api/collections/elements/scenes/schemas/scene.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { ModelCategory } from '@genfeedai/enums';

export class ElementSceneEntity extends BaseEntity implements ElementScene {
  declare readonly user?: string;
  declare readonly organization?: string;

  declare readonly key: string;
  declare readonly label: string;
  declare readonly description?: string;
  declare readonly category?: ModelCategory | null;

  declare readonly isFavorite: boolean;
}
