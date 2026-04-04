import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateCronJobDto {
  @IsOptional()
  @IsString()
  readonly name?: string;

  @IsOptional()
  @IsString()
  readonly schedule?: string;

  @IsOptional()
  @IsString()
  readonly timezone?: string;

  @IsOptional()
  @IsBoolean()
  readonly enabled?: boolean;

  @IsOptional()
  @IsObject()
  readonly payload?: Record<string, unknown>;
}
