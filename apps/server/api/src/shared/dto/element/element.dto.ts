import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class ElementDto {
  @ApiProperty({
    description:
      'Unique key for the element (lowercase, alphanumeric with hyphens)',
    example: 'example-key',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Key must be lowercase alphanumeric with hyphens only',
  })
  key!: string;

  @ApiProperty({
    description: 'Display label for the element',
    example: 'Example Label',
  })
  @IsNotEmpty()
  @IsString()
  label!: string;

  @ApiProperty({
    description: 'Description of the element',
    example: 'A detailed description of the element',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Model information for the element',
    required: false,
  })
  @IsOptional()
  @IsString()
  model?: string;
}
