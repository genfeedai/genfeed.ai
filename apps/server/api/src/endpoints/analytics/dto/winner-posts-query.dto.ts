import { AnalyticsDateRangeDto } from '@api/endpoints/analytics/dto/leaderboard-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

/** #5502 `GET /analytics/winners`: winners published in the range, optionally for one brand. */
export class WinnerPostsQueryDto extends AnalyticsDateRangeDto {
  @ApiProperty({
    description: 'Brand whose own posts are classified; omitted for all brands',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  brandId?: string;

  @ApiProperty({ description: 'Platform to filter by', required: false })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiProperty({
    default: 50,
    description: 'Number of winners to return, strongest first',
    maximum: 100,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
