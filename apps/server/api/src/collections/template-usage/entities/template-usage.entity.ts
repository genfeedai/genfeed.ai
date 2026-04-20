import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { type TemplateUsage } from '@genfeedai/prisma';

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
