import { SearchPaginationQueryDto } from '@api/helpers/dto/pagination-query.dto';
import { WaitlistStatus } from '@genfeedai/contracts';
import { IsEnum, IsOptional } from 'class-validator';

export class ListWaitlistQueryDto extends SearchPaginationQueryDto {
  @IsOptional()
  @IsEnum(WaitlistStatus)
  status?: WaitlistStatus;
}
