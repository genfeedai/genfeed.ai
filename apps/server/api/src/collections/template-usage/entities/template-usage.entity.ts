import { BaseEntity } from '@api/entities/base.entity';
import { type TemplateUsage } from '@genfeedai/prisma';

export class TemplateUsageEntity extends BaseEntity implements TemplateUsage {
  declare id: string;
  declare organizationId: string;
  declare userId: string;
  templateId!: string;
  organization!: string;
  user?: string;
  template!: string;
  generatedContent!: string;
  variables?: Record<string, string>;
  rating?: number;
  feedback?: string;
  wasModified!: boolean;
}
