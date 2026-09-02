import { BaseEntity } from '@api/entities/base.entity';
import { type Folder } from '@genfeedai/prisma';

export class FolderEntity extends BaseEntity implements Folder {
  declare readonly userId: string;
  declare readonly organizationId: string;
  declare readonly brandId: string | null;
  /** Parent folder for the Library tree. NULL is a root folder. */
  declare readonly parentId: string | null;

  declare readonly label: string;
  declare readonly description: string | null;
  declare readonly isActive: boolean;
}
