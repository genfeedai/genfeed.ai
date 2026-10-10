import { TurboRunStatus } from '@genfeedai/contracts';
import { IsEnum, IsOptional } from 'class-validator';

export class UpdateTurboRunDto {
  @IsOptional()
  @IsEnum(TurboRunStatus)
  status?: TurboRunStatus;
}
