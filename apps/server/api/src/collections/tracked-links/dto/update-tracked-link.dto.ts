import { IsBoolean, IsNotEmpty, IsString, ValidateIf } from 'class-validator';

/**
 * Fields a caller is allowed to mutate on an existing tracked link.
 * ValidateIf skips only omitted fields, so an explicit null fails validation
 * instead of reaching the service (IsOptional would let null through).
 */
export class UpdateTrackedLinkDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  originalUrl?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  title?: string;
}
