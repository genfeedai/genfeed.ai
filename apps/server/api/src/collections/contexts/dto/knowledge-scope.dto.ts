import { KnowledgeMemoryScope } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class KnowledgeScopeDto {
  @ApiProperty({ enum: KnowledgeMemoryScope, enumName: 'KnowledgeMemoryScope' })
  @IsEnum(KnowledgeMemoryScope)
  scope!: KnowledgeMemoryScope;
}
