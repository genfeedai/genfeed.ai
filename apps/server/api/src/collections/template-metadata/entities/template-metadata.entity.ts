import { TemplateMetadata } from '@api/collections/template-metadata/schemas/template-metadata.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { TemplateDifficulty } from '@genfeedai/enums';

export class TemplateMetadataEntity
  extends BaseEntity
  implements TemplateMetadata
{
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
