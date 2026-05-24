import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { type Bookmark } from '@genfeedai/prisma';

export class BookmarkEntity extends BaseEntity implements Bookmark {
  id!: string;
  mongoId!: string | null;
  userId!: string;
  organizationId!: string;
  brandId!: string | null;
  folderId!: string | null;
  user!: string;
  organization!: string;
  brand?: string;
  category!: Bookmark['category'];
  url!: string;
  platform!: Bookmark['platform'];
  title!: string | null;
  content!: string;
  description!: string | null;
  author!: string | null;
  authorHandle!: string | null;
  thumbnailUrl!: string | null;
  mediaUrls!: string[];
  extractedIngredients!: string[];
  platformData!: Bookmark['platformData'];
  intent!: Bookmark['intent'];
  generatedIngredients!: string[];
  folder?: string;
  tags!: string[];
  savedAt!: Date;
  processedAt!: Date | null;
}
