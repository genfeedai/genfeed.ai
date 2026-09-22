import { TYPED_DECISION_PROVIDER_NAMES } from '@genfeedai/contracts/constants';
import type { TypedDecisionProviderName } from '@genfeedai/contracts/interfaces';
import { MAX_MARGIN_MULTIPLIER } from '@genfeedai/pricing';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';

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
    maximum: MAX_MARGIN_MULTIPLIER,
    minimum: 0.01,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(MAX_MARGIN_MULTIPLIER)
  readonly marginMultiplier?: number;

  @ApiProperty({
    description:
      'Which provider answers typed decisions. `none` keeps every migrated decision point on its deterministic path.',
    enum: TYPED_DECISION_PROVIDER_NAMES,
    required: false,
  })
  @IsOptional()
  @IsIn(TYPED_DECISION_PROVIDER_NAMES)
  readonly typedDecisionProvider?: TypedDecisionProviderName;
}
