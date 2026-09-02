import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { AGENT_PROGRAM_TEMPLATES } from '@genfeedai/contracts/constants';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDate,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const AGENT_PROGRAM_TEMPLATE_IDS = AGENT_PROGRAM_TEMPLATES.map(
  (template) => template.id,
);

export class CreateAgentCampaignFromTemplateDto {
  static readonly [FORBID_NON_WHITELISTED] = true;

  @IsEntityId()
  @ApiProperty({ description: 'Selected brand ID', required: true })
  brandId!: string;

  @IsString()
  @MaxLength(160)
  @ApiProperty({ description: 'Program label', required: true })
  label!: string;

  @IsString()
  @MaxLength(4000)
  @IsOptional()
  @ApiProperty({ description: 'Program brief', required: false })
  brief?: string;

  @IsIn(AGENT_PROGRAM_TEMPLATE_IDS)
  @ApiProperty({
    description: 'Server-owned Program template ID',
    enum: AGENT_PROGRAM_TEMPLATE_IDS,
    required: true,
  })
  templateId!: string;

  @IsArray()
  @IsEntityId({ each: true })
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsOptional()
  @ApiProperty({
    description: 'Existing selected-brand agents to attach to the Program',
    required: false,
    type: [String],
  })
  agentStrategyIds?: string[];

  @IsDate()
  @Type(() => Date)
  @ApiProperty({ description: 'Program start date', required: true })
  startDate!: Date;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  @ApiProperty({ description: 'Program end date', required: false })
  endDate?: Date;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiProperty({
    description: 'Shared credit allocation',
    required: false,
  })
  creditsAllocated?: number;
}
