import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateFolderDto {
  @ApiProperty({
    description: 'Brand ID if folder is brand-specific',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  brand?: string;

  @ApiProperty({
    description: 'Display label for the folder',
    example: 'My Ingredients',
  })
  @IsNotEmpty()
  @IsString()
  label!: string;

  @ApiProperty({
    description: 'Description of the folder',
    example: 'A folder to organize my ingredients',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Tags for categorizing the folder',
    example: ['important', 'video-assets'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  tags?: string[];
}
