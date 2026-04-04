import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class SplitImageDto {
  @IsInt()
  @Min(2)
  @Max(4)
  @ApiProperty({
    description: 'Number of rows in the grid',
    example: 2,
    maximum: 4,
    minimum: 2,
  })
  readonly gridRows!: number;

  @IsInt()
  @Min(2)
  @Max(4)
  @ApiProperty({
    description: 'Number of columns in the grid',
    example: 3,
    maximum: 4,
    minimum: 2,
  })
  readonly gridCols!: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(50)
  @ApiProperty({
    default: 10,
    description: 'Border inset in pixels to crop out from each frame edge',
    maximum: 50,
    minimum: 0,
    required: false,
  })
  readonly borderInset?: number;
}
