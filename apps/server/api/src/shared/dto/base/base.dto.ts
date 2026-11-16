import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export abstract class BaseCreateDto {}

export abstract class OrganizationalCreateDto extends BaseCreateDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly userId?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly organizationId?: string;
}

export abstract class BaseUpdateDto {}

export abstract class OrganizationalUpdateDto extends BaseUpdateDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly userId?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly organizationId?: string;
}
