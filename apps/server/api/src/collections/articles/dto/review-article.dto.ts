import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewArticleDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  focus?: string;

  @IsOptional()
  @IsBoolean()
  includeLineEdits?: boolean;
}
