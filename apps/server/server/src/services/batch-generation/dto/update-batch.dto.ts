import { BatchStatus } from '@genfeedai/enums';
import { IsEnum, IsOptional } from 'class-validator';

export class UpdateBatchDto {
  @IsOptional()
  @IsEnum(BatchStatus)
  status?: BatchStatus;
}
