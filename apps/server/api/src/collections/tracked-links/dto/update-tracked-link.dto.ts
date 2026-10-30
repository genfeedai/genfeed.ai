import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Fields a caller is allowed to mutate on an existing tracked link. */
export class UpdateTrackedLinkDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  originalUrl?: string;

  @IsOptional()
  @IsString()
  title?: string;
}
