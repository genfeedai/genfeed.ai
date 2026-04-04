import { ElementScene } from '@api/collections/elements/scenes/schemas/scene.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { ModelCategory } from '@genfeedai/enums';
import { Types } from 'mongoose';

export class ElementSceneEntity extends BaseEntity implements ElementScene {
  declare readonly user?: Types.ObjectId;
  declare readonly organization?: Types.ObjectId;

  declare readonly key: string;
  declare readonly label: string;
  declare readonly description?: string;
  declare readonly category?: ModelCategory | null;

  declare readonly isFavorite: boolean;
}
