import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsMongoId, IsNumber, IsString, Min } from 'class-validator';

export class CreatePostAnalyticsDto {
  @ApiProperty({
    description: 'Post ID',
  })
  @IsMongoId()
  post!: string;

  @ApiProperty({
    description: 'Ingredient ID',
  })
  @IsMongoId()
  ingredients!: string[];

  @ApiProperty({
    description: 'User ID',
  })
  @IsMongoId()
  user!: string;

  @ApiProperty({
    description: 'Brand ID',
  })
  @IsMongoId()
  brand!: string;

  @ApiProperty({
    description: 'Organization ID',
  })
  @IsMongoId()
  organization!: string;

  @ApiProperty({
    description: 'Social media platform',
  })
  @IsString()
  platform!: string;

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
    description: 'Total saves count',
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  totalSaves!: number;

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
    description: 'Increment in saves since last update',
  })
  @IsNumber()
  totalSavesIncrement!: number;

  @ApiProperty({
    description: 'Engagement rate (percentage)',
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  engagementRate!: number;
}
