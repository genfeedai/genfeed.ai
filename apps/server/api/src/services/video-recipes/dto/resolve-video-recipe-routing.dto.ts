import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

export class ResolveVideoRecipeRoutingDto {
  @ApiPropertyOptional({
    additionalProperties: { type: 'string' },
    description: 'Model key to pin per recipe step id.',
    type: 'object',
  })
  @IsOptional()
  @IsObject()
  pins?: Record<string, string>;
}
