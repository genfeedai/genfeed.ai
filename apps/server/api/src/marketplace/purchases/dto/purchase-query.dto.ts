import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { PurchaseStatus } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export class PurchaseQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Filter purchases by status',
    enum: PurchaseStatus,
    enumName: 'PurchaseStatus',
    required: false,
  })
  @IsOptional()
  @IsEnum(PurchaseStatus)
  status?: PurchaseStatus;
}
