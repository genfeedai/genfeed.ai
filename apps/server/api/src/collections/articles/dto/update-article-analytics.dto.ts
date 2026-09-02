import { CreateArticleAnalyticsDto } from '@api/collections/articles/dto/create-article-analytics.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateArticleAnalyticsDto extends PartialType(
  CreateArticleAnalyticsDto,
) {
  @ApiProperty({
    description: 'Whether the analytics record is marked as deleted',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isDeleted?: boolean;
}
