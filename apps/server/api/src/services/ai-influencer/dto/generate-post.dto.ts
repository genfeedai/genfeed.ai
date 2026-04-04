import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class GeneratePostDto {
  @IsString()
  @ApiProperty({ description: 'Persona slug to generate content for' })
  readonly personaSlug!: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ApiProperty({
    description: 'Platforms to publish to (e.g., instagram, twitter)',
    example: ['instagram', 'twitter'],
    type: [String],
  })
  readonly platforms!: string[];

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Override prompt for image generation',
    required: false,
  })
  readonly prompt?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Override caption for the post',
    required: false,
  })
  readonly caption?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Aspect ratio for image (e.g., 1:1, 4:5, 16:9)',
    required: false,
  })
  readonly aspectRatio?: string;
}

export class ListPostsQueryDto {
  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Filter by persona slug',
    required: false,
  })
  readonly personaSlug?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Filter by platform',
    required: false,
  })
  readonly platform?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(100)
  @ApiProperty({
    default: 20,
    description: 'Number of results to return',
    required: false,
  })
  readonly limit?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @ApiProperty({
    default: 1,
    description: 'Page number',
    required: false,
  })
  readonly page?: number;
}
