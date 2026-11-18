import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class OnboardingDraftsQueryDto {
  @ApiProperty({
    default: 7,
    description: 'How many days back to include organizations created in',
    maximum: 90,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;

  @ApiProperty({
    default: 20,
    description: 'How many organizations to return, newest first',
    maximum: 50,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
