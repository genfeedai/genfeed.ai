import { DarkroomReviewStatus } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ReviewAssetDto {
  @IsEnum(DarkroomReviewStatus)
  @ApiProperty({
    description: 'Review status',
    enum: DarkroomReviewStatus,
    enumName: 'DarkroomReviewStatus',
  })
  readonly reviewStatus!: DarkroomReviewStatus;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Review notes', required: false })
  readonly notes?: string;
}
