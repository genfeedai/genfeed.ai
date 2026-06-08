import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { TemplateDifficulty } from '@genfeedai/enums';
import { type TemplateMetadata } from '@genfeedai/prisma';

export class TemplateMetadataEntity
  extends BaseEntity
  implements TemplateMetadata
{
  declare id: string;
  declare mongoId: string | null;
  templateId!: string;
  data!: TemplateMetadata['data'];
  template!: string;
  estimatedTime?: number;
  difficulty?: TemplateDifficulty;
  goals?: string[];
  requiredFeatures?: string[];
  declare version: string | null;
  declare author: string | null;
  declare license: string | null;
  declare compatiblePlatforms: string[];
  declare successRate: number | null;
  declare averageQuality: number | null;
  declare usageCount: number | null;
  declare lastUsed: Date | null;
}
