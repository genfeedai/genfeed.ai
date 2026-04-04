import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateRemixPostDto {
  @IsString()
  @MinLength(1)
  @ApiProperty({
    description: 'New description/caption for the remix post',
    example: 'Check out this amazing content! #viral #trending',
    required: true,
  })
  readonly description!: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Optional label/title for the remix post',
    example: 'Remix: My Original Post',
    required: false,
  })
  readonly label?: string;
}
