import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateBeehiivSubscribersDto {
  @ApiProperty({
    description: 'Brand owning the connected Beehiiv publication',
  })
  @IsString()
  @MinLength(1)
  readonly brandId!: string;

  @ApiPropertyOptional({
    description:
      "Which of the brand's connected Beehiiv publications to add to; omitted uses the brand's default account",
  })
  @IsOptional()
  @IsString()
  readonly credentialId?: string;

  @ApiProperty({
    description: 'Subscriber addresses to add to the connected publication',
    example: ['reader@example.com'],
    isArray: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsEmail({}, { each: true })
  readonly emails!: string[];

  @ApiPropertyOptional({
    description: 'Acquisition source recorded by Beehiiv',
  })
  @IsOptional()
  @IsString()
  readonly utmSource?: string;
}
