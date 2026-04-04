import { Folder } from '@api/collections/folders/schemas/folder.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { Types } from 'mongoose';

export class FolderEntity extends BaseEntity implements Folder {
  declare readonly user: Types.ObjectId;
  declare readonly organization: Types.ObjectId;
  declare readonly brand?: Types.ObjectId;

  declare readonly label: string;
  declare readonly description?: string;
  declare readonly tags: Types.ObjectId[];

  declare readonly isActive: boolean;
}
