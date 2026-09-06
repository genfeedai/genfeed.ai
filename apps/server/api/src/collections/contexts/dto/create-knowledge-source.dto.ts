import { KnowledgeScopeDto } from '@api/collections/contexts/dto/knowledge-scope.dto';
import {
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export const KNOWLEDGE_CAPTURE_TEXT_MAX_LENGTH = 200_000;

export class CreateKnowledgeSourceDto extends KnowledgeScopeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title!: string;

  @ApiProperty({ enum: KnowledgeSourceKind, enumName: 'KnowledgeSourceKind' })
  @IsEnum(KnowledgeSourceKind)
  kind!: KnowledgeSourceKind;

  @ApiProperty({
    enum: KnowledgeSourcePurpose,
    enumName: 'KnowledgeSourcePurpose',
  })
  @IsEnum(KnowledgeSourcePurpose)
  purpose!: KnowledgeSourcePurpose;

  @ApiPropertyOptional({
    description:
      'Captured text for TEXT sources. Providing it creates version 1 and starts ingestion.',
    maxLength: KNOWLEDGE_CAPTURE_TEXT_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(KNOWLEDGE_CAPTURE_TEXT_MAX_LENGTH)
  text?: string;

  @ApiPropertyOptional({
    description:
      'HTTP(S) location fetched for URL, DOCUMENT and FILE sources. Providing it creates version 1 and starts ingestion.',
  })
  @IsOptional()
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  @MaxLength(2048)
  referenceUrl?: string;

  @ApiPropertyOptional({
    type: Object,
    description: 'Capture origin merged into the version provenance',
  })
  @IsOptional()
  @IsObject()
  provenance?: Prisma.InputJsonObject;
}
