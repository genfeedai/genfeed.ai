import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePublicYoutubeOutliersDto {
  @ApiProperty({
    description: 'A YouTube channel URL, @handle or channel ID.',
    example: 'https://www.youtube.com/@MrBeast',
    maxLength: 200,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  readonly channel!: string;
}
