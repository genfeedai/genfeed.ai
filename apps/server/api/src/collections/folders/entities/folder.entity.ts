import { Folder } from '@api/collections/folders/schemas/folder.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';

export class FolderEntity extends BaseEntity implements Folder {
  declare readonly user: string;
  declare readonly organization: string;
  declare readonly brand?: string;

  declare readonly label: string;
  declare readonly description?: string;
  declare readonly tags: string[];

  declare readonly isActive: boolean;
}
