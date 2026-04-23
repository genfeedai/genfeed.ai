import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { TemplateDifficulty } from '@genfeedai/enums';
import { type TemplateMetadata } from '@genfeedai/prisma';

export class TemplateMetadataEntity
  extends BaseEntity
  implements TemplateMetadata
{
  id!: string;
  mongoId!: string | null;
  templateId!: string;
  data!: TemplateMetadata['data'];
  template!: string;
  estimatedTime?: number;
  difficulty?: TemplateDifficulty;
  goals?: string[];
  version?: string;
  author?: string;
  license?: string;
  requiredFeatures?: string[];
  compatiblePlatforms?: string[];
  successRate?: number;
  averageQuality?: number;
  usageCount?: number;
  lastUsed?: Date;
}
