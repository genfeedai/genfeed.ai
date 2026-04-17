import { TemplateUsage } from '@api/collections/template-usage/schemas/template-usage.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';

export class TemplateUsageEntity extends BaseEntity implements TemplateUsage {
  organization!: string;
  user?: string;
  template!: string;
  generatedContent!: string;
  variables?: Record<string, string>;
  rating?: number;
  feedback?: string;
  wasModified!: boolean;
}
