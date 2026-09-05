import { KnowledgeSourcePurpose } from '@genfeedai/contracts';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateKnowledgeSourceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title?: string;

  @ApiPropertyOptional({
    enum: KnowledgeSourcePurpose,
    enumName: 'KnowledgeSourcePurpose',
  })
  @IsOptional()
  @IsEnum(KnowledgeSourcePurpose)
  purpose?: KnowledgeSourcePurpose;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;
}
