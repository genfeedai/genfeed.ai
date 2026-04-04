import { LeadSource, LeadStatus } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateLeadDto {
  @IsString()
  @ApiProperty({ description: 'Lead name' })
  readonly name!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Email address', required: false })
  readonly email?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Phone number', required: false })
  readonly phone?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Company name', required: false })
  readonly company?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Job title', required: false })
  readonly title?: string;

  @IsEnum(LeadStatus)
  @IsOptional()
  @ApiProperty({
    description: 'Lead status',
    enum: LeadStatus,
    enumName: 'LeadStatus',
    required: false,
  })
  readonly status?: LeadStatus;

  @IsEnum(LeadSource)
  @IsOptional()
  @ApiProperty({
    description: 'Lead source',
    enum: LeadSource,
    enumName: 'LeadSource',
    required: false,
  })
  readonly source?: LeadSource;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Deal value', required: false })
  readonly dealValue?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Currency code', required: false })
  readonly currency?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Notes', required: false })
  readonly notes?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Product offering', required: false })
  readonly productOffering?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Twitter handle', required: false })
  readonly twitterHandle?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Instagram handle', required: false })
  readonly instagramHandle?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Discord handle', required: false })
  readonly discordHandle?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Telegram handle', required: false })
  readonly telegramHandle?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Contact date (ISO)', required: false })
  readonly contactDate?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({ description: 'Tags', required: false, type: [String] })
  readonly tags?: string[];
}
