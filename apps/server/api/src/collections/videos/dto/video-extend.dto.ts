import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class VideoExtendDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  @Matches(/\S/u, { message: 'prompt must contain visible text' })
  @ApiProperty({
    description: 'Direction for the generated continuation',
    example: 'Continue the camera move as the subject enters the next room',
  })
  readonly prompt!: string;

  @IsString()
  @MinLength(1)
  @ApiProperty({ description: 'Allowlisted video generation model key' })
  readonly model!: string;

  @IsInt()
  @Min(1)
  @Max(30)
  @IsOptional()
  @ApiProperty({ default: 8, maximum: 30, minimum: 1, required: false })
  readonly duration?: number;
}
