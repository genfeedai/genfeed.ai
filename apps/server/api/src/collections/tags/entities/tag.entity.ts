import { BaseEntity } from '@api/entities/base.entity';
import { type Tag } from '@genfeedai/prisma';

export class TagEntity extends BaseEntity implements Tag {
  declare readonly id: string;
  declare readonly userId: string;
  declare readonly organizationId: string;
  declare readonly brandId: string | null;

  declare readonly category: Tag['category'];

  declare readonly label: Tag['label'];
  declare readonly description: Tag['description'];
  declare readonly key: Tag['key'];
  declare readonly backgroundColor: Tag['backgroundColor'];
  declare readonly textColor: Tag['textColor'];
  declare readonly isActive: Tag['isActive'];
}
