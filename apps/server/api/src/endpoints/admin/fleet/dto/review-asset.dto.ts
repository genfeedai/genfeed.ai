import { DarkroomReviewStatus as FleetReviewStatus } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ReviewAssetDto {
  @IsEnum(FleetReviewStatus)
  @ApiProperty({
    description: 'Review status',
    enum: FleetReviewStatus,
    enumName: 'FleetReviewStatus',
  })
  readonly reviewStatus!: FleetReviewStatus;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Review notes', required: false })
  readonly notes?: string;
}
