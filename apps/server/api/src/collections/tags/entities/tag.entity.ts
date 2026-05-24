import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { type Tag } from '@genfeedai/prisma';

export class TagEntity extends BaseEntity implements Tag {
  declare readonly id: string;
  declare readonly mongoId: string | null;
  declare readonly userId: string;
  declare readonly organizationId: string;
  declare readonly brandId: string | null;
  declare readonly user?: string;
  declare readonly organization?: string;
  declare readonly brand?: string;

  declare readonly category: Tag['category'];

  declare readonly label: Tag['label'];
  declare readonly description: Tag['description'];
  declare readonly key: Tag['key'];
  declare readonly backgroundColor: Tag['backgroundColor'];
  declare readonly textColor: Tag['textColor'];
  declare readonly isActive: Tag['isActive'];
}
