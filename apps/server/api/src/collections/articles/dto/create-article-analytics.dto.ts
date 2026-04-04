import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsMongoId, IsNumber, Min } from 'class-validator';
import type { Types } from 'mongoose';

export class CreateArticleAnalyticsDto {
  @ApiProperty({
    description: 'Article ID',
  })
  @IsMongoId()
  article!: Types.ObjectId;

  @ApiProperty({
    description: 'User ID',
  })
  @IsMongoId()
  user!: Types.ObjectId;

  @ApiProperty({
    description: 'Brand ID',
  })
  @IsMongoId()
  brand!: Types.ObjectId;

  @ApiProperty({
    description: 'Organization ID',
  })
  @IsMongoId()
  organization!: Types.ObjectId;

  @ApiProperty({
    description: 'Date of analytics record',
  })
  @IsDate()
  date!: Date;

  @ApiProperty({
    description: 'Total views count',
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  totalViews!: number;

  @ApiProperty({
    description: 'Total likes count',
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  totalLikes!: number;

  @ApiProperty({
    description: 'Total comments count',
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  totalComments!: number;

  @ApiProperty({
    description: 'Total shares count',
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  totalShares!: number;

  @ApiProperty({
    description: 'Click-through rate (percentage)',
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  clickThroughRate!: number;

  @ApiProperty({
    description: 'Increment in views since last update',
  })
  @IsNumber()
  totalViewsIncrement!: number;

  @ApiProperty({
    description: 'Increment in likes since last update',
  })
  @IsNumber()
  totalLikesIncrement!: number;

  @ApiProperty({
    description: 'Increment in comments since last update',
  })
  @IsNumber()
  totalCommentsIncrement!: number;

  @ApiProperty({
    description: 'Increment in shares since last update',
  })
  @IsNumber()
  totalSharesIncrement!: number;

  @ApiProperty({
    description: 'Engagement rate (percentage)',
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  engagementRate!: number;
}
