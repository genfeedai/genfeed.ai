import { BatchStatus } from '@genfeedai/contracts';
import { IsEnum, IsOptional } from 'class-validator';

export class UpdateBatchDto {
  @IsOptional()
  @IsEnum(BatchStatus)
  status?: BatchStatus;
}
