import { MAX_MARGIN_MULTIPLIER } from '@genfeedai/helpers';
import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class CreatePlatformSettingDto {
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
}
