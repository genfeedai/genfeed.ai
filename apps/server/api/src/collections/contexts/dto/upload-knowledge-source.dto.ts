import { KnowledgeScopeDto } from '@api/collections/contexts/dto/knowledge-scope.dto';
import { KnowledgeSourcePurpose } from '@genfeedai/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Multipart fields sent alongside an uploaded corpus file. */
export class UploadKnowledgeSourceDto extends KnowledgeScopeDto {
  @ApiProperty({
    enum: KnowledgeSourcePurpose,
    enumName: 'KnowledgeSourcePurpose',
  })
  @IsEnum(KnowledgeSourcePurpose)
  purpose!: KnowledgeSourcePurpose;

  @ApiPropertyOptional({ description: 'Defaults to the uploaded file name.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title?: string;
}
