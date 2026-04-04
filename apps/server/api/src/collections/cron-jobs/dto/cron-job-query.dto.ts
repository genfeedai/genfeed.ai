import { IsBooleanString, IsOptional, IsString } from 'class-validator';

export class CronJobQueryDto {
  @IsOptional()
  @IsString()
  readonly jobType?: string;

  @IsOptional()
  @IsBooleanString()
  readonly enabled?: string;
}
