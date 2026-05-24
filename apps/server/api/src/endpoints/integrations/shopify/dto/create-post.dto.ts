import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreatePostDto {
  @ApiProperty({
    description: 'Genfeed ingredient (content) ID to publish',
    example: '507f1f77bcf86cd799439011',
  })
  @IsEntityId()
  @IsNotEmpty()
  ingredientId!: string;

  @ApiProperty({
    description: 'Target platforms to publish to',
    example: ['twitter', 'instagram'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  platforms!: string[];

  @ApiProperty({
    description: 'Caption/text to publish with the content',
    example: 'Check out our new product! #shopify #ecommerce',
  })
  @IsString()
  @IsNotEmpty()
  caption!: string;

  @ApiPropertyOptional({
    description:
      'Scheduled publish time (ISO 8601). If not provided, publishes immediately.',
    example: '2026-01-25T10:00:00.000Z',
  })
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}
