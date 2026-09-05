import { KnowledgeScopeDto } from '@api/collections/contexts/dto/knowledge-scope.dto';
import {
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

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
}
