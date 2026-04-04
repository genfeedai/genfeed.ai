import { TemplateMetadata } from '@api/collections/template-metadata/schemas/template-metadata.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { TemplateDifficulty } from '@genfeedai/enums';
import { Types } from 'mongoose';

export class TemplateMetadataEntity
  extends BaseEntity
  implements TemplateMetadata
{
  template!: Types.ObjectId;
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
