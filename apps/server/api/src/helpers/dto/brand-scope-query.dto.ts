import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class BrandScopeQueryDto {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  organizationId?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  brandId?: string;
}
