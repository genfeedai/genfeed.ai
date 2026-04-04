import { ApiProperty } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateSellerDto {
  @ApiProperty({
    description: 'Display name for the seller profile',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  displayName!: string;

  @ApiProperty({
    description: 'Short bio for the seller profile',
    maxLength: 500,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiProperty({
    description: 'Avatar URL for the seller profile',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  avatar?: string;

  @ApiProperty({
    description: 'Website URL for the seller profile',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiProperty({
    description: 'Social media links',
    required: false,
  })
  @IsOptional()
  @IsObject()
  social?: {
    twitter?: string;
    github?: string;
    linkedin?: string;
    youtube?: string;
  };
}
