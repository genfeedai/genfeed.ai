import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { CredentialPlatform } from '@genfeedai/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePostingSignatureDto {
  @ApiProperty({ maxLength: 4_000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4_000)
  body!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @ApiProperty({
    enum: CredentialPlatform,
    isArray: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(CredentialPlatform, { each: true })
  platforms!: CredentialPlatform[];

  @ApiPropertyOptional({ enum: ['append', 'prepend'] })
  @IsOptional()
  @IsIn(['append', 'prepend'])
  placement?: 'append' | 'prepend';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityId()
  brandId?: string;
}
