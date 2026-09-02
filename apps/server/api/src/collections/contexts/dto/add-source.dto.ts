import { KnowledgeBaseCategory } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class AddSourceDto {
  @ApiProperty({
    description: 'Source category. URL and DOCUMENT are ingested.',
    enum: KnowledgeBaseCategory,
  })
  @IsEnum(KnowledgeBaseCategory)
  category!: KnowledgeBaseCategory;

  @ApiProperty({ description: 'Display label for the source' })
  @IsString()
  @MaxLength(200)
  label!: string;

  @ApiProperty({
    description: 'HTTP(S) URL to fetch for ingestion',
  })
  @IsUrl({ require_tld: false })
  referenceUrl!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  summary?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
