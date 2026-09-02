import { BaseEntity } from '@api/entities/base.entity';
import { TemplateDifficulty } from '@genfeedai/enums';
import { type TemplateMetadata } from '@genfeedai/prisma';

export class TemplateMetadataEntity
  extends BaseEntity
  implements TemplateMetadata
{
  declare id: string;
  templateId!: string;
  data!: TemplateMetadata['data'];
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
