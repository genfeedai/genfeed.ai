import type {
  AccountHealthSignals,
  AccountHealthThresholds,
} from '@genfeedai/interfaces';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

export class AssessAccountHealthDto {
  @ApiPropertyOptional({
    description:
      'Optional signal overrides for tests, provider callbacks, or manual re-assessment.',
  })
  @IsOptional()
  @IsObject()
  readonly signals?: Partial<AccountHealthSignals>;

  @ApiPropertyOptional({
    description:
      'Optional per-assessment threshold overrides persisted with the account health record.',
  })
  @IsOptional()
  @IsObject()
  readonly thresholds?: Partial<AccountHealthThresholds>;
}
