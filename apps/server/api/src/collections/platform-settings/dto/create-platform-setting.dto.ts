import { MarginInputMode } from '@genfeedai/contracts';
import { TYPED_DECISION_PROVIDER_NAMES } from '@genfeedai/contracts/constants';
import type { TypedDecisionProviderName } from '@genfeedai/contracts/interfaces';
import { MAX_MARGIN_MULTIPLIER } from '@genfeedai/pricing';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class CreatePlatformSettingDto {
  @ApiProperty({
    description:
      'Generation sell/cost ratio applied to provider USD. 3.33 = 70% margin on sell price.',
    maximum: MAX_MARGIN_MULTIPLIER,
    minimum: 0.01,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(MAX_MARGIN_MULTIPLIER)
  readonly marginMultiplierGeneration?: number;

  @ApiProperty({
    description:
      'Agent-chat sell/cost ratio applied to provider USD. 1.7 = 70% markup on provider cost.',
    maximum: MAX_MARGIN_MULTIPLIER,
    minimum: 0.01,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(MAX_MARGIN_MULTIPLIER)
  readonly marginMultiplierAgentChat?: number;

  @IsEnum(MarginInputMode)
  @IsOptional()
  @ApiProperty({
    default: MarginInputMode.MARGIN,
    description:
      'How the two margin multipliers above are typed and read in /admin: a markup percent on provider cost, or a margin percent on sell price. Never changes what is stored or billed.',
    enum: MarginInputMode,
    enumName: 'MarginInputMode',
    required: false,
  })
  readonly marginInputMode?: MarginInputMode;

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
