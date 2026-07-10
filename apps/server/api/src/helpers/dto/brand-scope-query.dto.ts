import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class BrandScopeQueryDto {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  organization?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  brand?: string;
}
