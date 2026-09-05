import { KnowledgeRetentionPolicy } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreateKnowledgeVersionDto {
  @ApiProperty({ description: 'SHA-256 identity of the captured evidence' })
  @IsString()
  @Matches(/^sha256:[a-f0-9]{64}$/)
  contentHash!: string;

  @ApiProperty({
    type: Object,
    description: 'Captured origin and attribution; cleared on purge',
  })
  @IsObject()
  provenance!: Prisma.InputJsonObject;

  @ApiPropertyOptional({
    type: Object,
    description: 'Captured content and locators; cleared on purge',
  })
  @IsOptional()
  @IsObject()
  payload?: Prisma.InputJsonObject;

  @ApiProperty()
  @IsDateString()
  observedAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({
    enum: KnowledgeRetentionPolicy,
    enumName: 'KnowledgeRetentionPolicy',
  })
  @IsOptional()
  @IsEnum(KnowledgeRetentionPolicy)
  retentionPolicy?: KnowledgeRetentionPolicy;
}
