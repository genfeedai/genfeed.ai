import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min } from 'class-validator';

/**
 * Operator-editable fields of the platform-settings singleton. Intentionally
 * NOT a PartialType of the create DTO: the singleton `key` must never be
 * mutable via the API, or a PATCH could rename the canonical row and orphan it
 * (workers would then miss it and fall back to default pricing).
 */
export class UpdatePlatformSettingDto {
  @ApiProperty({
    description:
      'Margin multiplier applied on top of the base provider-cost markup. 1.0 = base margin only.',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  readonly marginMultiplier?: number;
}
