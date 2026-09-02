import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class GenerateContentPlanDto {
  @IsString()
  @IsOptional()
  readonly name?: string;

  @IsDateString()
  readonly periodStart!: string;

  @IsDateString()
  readonly periodEnd!: string;

  @IsNumber()
  @Min(1)
  @Max(50)
  @IsOptional()
  readonly itemCount?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  readonly topics?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  readonly platforms?: string[];

  @IsString()
  @IsOptional()
  readonly additionalInstructions?: string;
}
