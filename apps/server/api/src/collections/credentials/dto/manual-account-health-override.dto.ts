import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsDateString,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class ManualAccountHealthOverrideDto {
  @ApiProperty({
    description:
      'Must be true to confirm that the account-health hold is being manually overridden.',
  })
  @Equals(true)
  readonly confirm!: true;

  @ApiPropertyOptional({
    description: 'Optional override expiry. Open-ended overrides are allowed.',
  })
  @IsOptional()
  @IsDateString()
  readonly expiresAt?: string;

  @ApiProperty({
    description:
      'Operator-visible reason for overriding the warmup publishing hold.',
  })
  @IsString()
  @MinLength(6)
  readonly reason!: string;
}
