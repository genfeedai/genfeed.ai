import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DispatchBatchProjectItemDto {
  @ApiPropertyOptional({
    description: 'Pending ingredient the dispatch created',
  })
  @IsOptional()
  @IsEntityId()
  readonly ingredientId?: string;

  @ApiPropertyOptional({ description: 'Why the generation request failed' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  readonly error?: string;
}
