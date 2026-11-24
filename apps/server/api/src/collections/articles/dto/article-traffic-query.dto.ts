import { IsOptional, Matches } from 'class-validator';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ArticleTrafficQueryDto {
  @IsOptional()
  @Matches(DAY_PATTERN, { message: 'startDate must be YYYY-MM-DD' })
  startDate?: string;

  @IsOptional()
  @Matches(DAY_PATTERN, { message: 'endDate must be YYYY-MM-DD' })
  endDate?: string;
}
