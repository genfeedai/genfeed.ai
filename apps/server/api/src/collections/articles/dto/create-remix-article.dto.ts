import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateRemixArticleDto {
  @IsOptional()
  @IsString()
  @ApiProperty({
    description:
      'New title for the remix article (optional, defaults to "Remix: [original title]")',
    example: 'My Remix Article',
    required: false,
  })
  readonly label?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Additional instructions for remixing the article content',
    example: 'Make it more casual and add humor',
    required: false,
  })
  readonly instructions?: string;
}
