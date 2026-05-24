import {
  SKILL_CHANNELS,
  SKILL_MODALITIES,
  SKILL_SOURCES,
  SKILL_STATUSES,
  SKILL_WORKFLOW_STAGES,
} from '@api/collections/skills/schemas/skill.schema';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ByokProvider, ContentSkillCategory } from '@genfeedai/enums';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SkillPayloadDto {
  @IsString()
  @MaxLength(140)
  @ApiProperty({ type: String })
  name!: string;

  @IsString()
  @MaxLength(160)
  @ApiProperty({ type: String })
  slug!: string;

  @IsString()
  @MaxLength(2000)
  @ApiProperty({ type: String })
  description!: string;

  @IsEnum(ContentSkillCategory)
  @ApiProperty({ enum: ContentSkillCategory })
  category!: ContentSkillCategory;

  @IsArray()
  @IsEnum(SKILL_MODALITIES, { each: true })
  @ApiProperty({ enum: SKILL_MODALITIES, isArray: true })
  modalities!: (typeof SKILL_MODALITIES)[number][];

  @IsArray()
  @IsEnum(SKILL_CHANNELS, { each: true })
  @ApiProperty({ enum: SKILL_CHANNELS, isArray: true })
  channels!: (typeof SKILL_CHANNELS)[number][];

  @IsEnum(SKILL_WORKFLOW_STAGES)
  @ApiProperty({ enum: SKILL_WORKFLOW_STAGES })
  workflowStage!: (typeof SKILL_WORKFLOW_STAGES)[number];

  @IsArray()
  @IsEnum(ByokProvider, { each: true })
  @ApiPropertyOptional({ enum: ByokProvider, isArray: true })
  requiredProviders?: ByokProvider[];

  @IsOptional()
  @IsObject()
  @ApiPropertyOptional({ type: Object })
  configSchema?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  @ApiPropertyOptional({ type: Object })
  inputSchema?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  @ApiPropertyOptional({ type: Object })
  outputSchema?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  @ApiPropertyOptional({ type: String })
  defaultInstructions?: string;

  @IsOptional()
  @IsObject()
  @ApiPropertyOptional({ type: Object })
  reviewDefaults?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(16000)
  @ApiPropertyOptional({ type: String })
  systemPromptTemplate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiPropertyOptional({ type: [String] })
  toolOverrides?: string[];

  @IsOptional()
  @IsEnum(SKILL_SOURCES)
  @ApiPropertyOptional({ enum: SKILL_SOURCES })
  source?: (typeof SKILL_SOURCES)[number];

  @IsOptional()
  @IsEnum(SKILL_STATUSES)
  @ApiPropertyOptional({ enum: SKILL_STATUSES })
  status?: (typeof SKILL_STATUSES)[number];

  @IsOptional()
  @IsEntityId()
  @ApiPropertyOptional({ type: String })
  baseSkill?: string;
}

export class CreateSkillDto extends SkillPayloadDto {
  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ type: Boolean })
  isBuiltIn?: boolean;
}

export class ImportSkillDto extends SkillPayloadDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @ApiPropertyOptional({ type: String })
  sourceUrl?: string;
}

export class CustomizeSkillDto {
  @IsOptional()
  @IsString()
  @MaxLength(140)
  @ApiPropertyOptional({ type: String })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  @ApiPropertyOptional({ type: String })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @ApiPropertyOptional({ type: String })
  description?: string;
}

export class UpdateSkillDto {
  @IsOptional()
  @IsString()
  @MaxLength(140)
  @ApiPropertyOptional({ type: String })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  @ApiPropertyOptional({ type: String })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @ApiPropertyOptional({ type: String })
  description?: string;

  @IsOptional()
  @IsEnum(ContentSkillCategory)
  @ApiPropertyOptional({ enum: ContentSkillCategory })
  category?: ContentSkillCategory;

  @IsOptional()
  @IsArray()
  @IsEnum(SKILL_MODALITIES, { each: true })
  @ApiPropertyOptional({ enum: SKILL_MODALITIES, isArray: true })
  modalities?: (typeof SKILL_MODALITIES)[number][];

  @IsOptional()
  @IsArray()
  @IsEnum(SKILL_CHANNELS, { each: true })
  @ApiPropertyOptional({ enum: SKILL_CHANNELS, isArray: true })
  channels?: (typeof SKILL_CHANNELS)[number][];

  @IsOptional()
  @IsEnum(SKILL_WORKFLOW_STAGES)
  @ApiPropertyOptional({ enum: SKILL_WORKFLOW_STAGES })
  workflowStage?: (typeof SKILL_WORKFLOW_STAGES)[number];

  @IsOptional()
  @IsArray()
  @IsEnum(ByokProvider, { each: true })
  @ApiPropertyOptional({ enum: ByokProvider, isArray: true })
  requiredProviders?: ByokProvider[];

  @IsOptional()
  @IsObject()
  @ApiPropertyOptional({ type: Object })
  configSchema?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  @ApiPropertyOptional({ type: Object })
  inputSchema?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  @ApiPropertyOptional({ type: Object })
  outputSchema?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  @ApiPropertyOptional({ type: String })
  defaultInstructions?: string;

  @IsOptional()
  @IsObject()
  @ApiPropertyOptional({ type: Object })
  reviewDefaults?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(16000)
  @ApiPropertyOptional({ type: String })
  systemPromptTemplate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiPropertyOptional({ type: [String] })
  toolOverrides?: string[];

  @IsOptional()
  @IsEnum(SKILL_STATUSES)
  @ApiPropertyOptional({ enum: SKILL_STATUSES })
  status?: (typeof SKILL_STATUSES)[number];
}
