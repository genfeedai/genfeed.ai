import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePlatformSettingDto {
  @ApiProperty({
    description: 'Singleton sentinel key — always "platform".',
    required: false,
  })
  @IsOptional()
  @IsString()
  readonly key?: string;

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
