import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateContentScheduleDto {
  @IsString()
  readonly name!: string;

  @IsString()
  readonly cronExpression!: string;

  @IsOptional()
  @IsString()
  readonly timezone?: string;

  @IsArray()
  @IsString({ each: true })
  readonly skillSlugs!: string[];

  @IsOptional()
  @IsObject()
  readonly skillParams?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  readonly isEnabled?: boolean;
}
