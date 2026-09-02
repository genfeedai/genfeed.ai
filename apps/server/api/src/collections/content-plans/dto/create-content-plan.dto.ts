import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateContentPlanDto {
  @IsString()
  readonly name!: string;

  @IsString()
  @IsOptional()
  readonly description?: string;

  @IsDateString()
  readonly periodStart!: string;

  @IsDateString()
  readonly periodEnd!: string;
}
