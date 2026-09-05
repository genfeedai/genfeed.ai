import { KnowledgeScopeDto } from '@api/collections/contexts/dto/knowledge-scope.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateKnowledgeSpaceDto extends KnowledgeScopeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title!: string;
}
