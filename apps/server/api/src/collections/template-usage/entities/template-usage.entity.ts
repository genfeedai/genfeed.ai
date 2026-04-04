import { TemplateUsage } from '@api/collections/template-usage/schemas/template-usage.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { Types } from 'mongoose';

export class TemplateUsageEntity extends BaseEntity implements TemplateUsage {
  organization!: Types.ObjectId;
  user?: Types.ObjectId;
  template!: Types.ObjectId;
  generatedContent!: string;
  variables?: Record<string, string>;
  rating?: number;
  feedback?: string;
  wasModified!: boolean;
}
