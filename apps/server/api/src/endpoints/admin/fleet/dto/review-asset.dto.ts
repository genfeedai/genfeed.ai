import { DarkroomReviewStatus as FleetReviewStatus } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class ReviewAssetDto {
  @IsEnum(FleetReviewStatus)
  @ApiProperty({
    description: 'Review status',
    enum: FleetReviewStatus,
    enumName: 'FleetReviewStatus',
  })
  readonly reviewStatus!: FleetReviewStatus;
}
