import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Types } from 'mongoose';

export class CreateFolderDto {
  @ApiProperty({
    description: 'Brand ID if folder is brand-specific',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  brand?: Types.ObjectId;

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
  tags?: Types.ObjectId[];
}
