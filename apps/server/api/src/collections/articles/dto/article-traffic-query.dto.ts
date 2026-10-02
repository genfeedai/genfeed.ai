import type { ArticleTrafficPeriod } from '@genfeedai/contracts/interfaces/content/article-traffic.interface';
import { IsIn, IsOptional } from 'class-validator';

export class ArticleTrafficQueryDto {
  @IsOptional()
  @IsIn(['7d', '30d', '90d', 'all'])
  period: ArticleTrafficPeriod = '30d';
}
