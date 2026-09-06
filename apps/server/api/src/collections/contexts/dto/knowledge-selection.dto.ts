import { KnowledgeSourcePurpose } from '@genfeedai/contracts';
import type { KnowledgeSelection } from '@genfeedai/contracts/interfaces';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export const KNOWLEDGE_SELECTION_MAX_IDS = 50;

export class KnowledgeSelectionDto implements KnowledgeSelection {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(KNOWLEDGE_SELECTION_MAX_IDS)
  @IsString({ each: true })
  sourceIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(KNOWLEDGE_SELECTION_MAX_IDS)
  @IsString({ each: true })
  spaceIds?: string[];

  @ApiPropertyOptional({
    enum: KnowledgeSourcePurpose,
    enumName: 'KnowledgeSourcePurpose',
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(KnowledgeSourcePurpose, { each: true })
  purposes?: KnowledgeSourcePurpose[];
}
