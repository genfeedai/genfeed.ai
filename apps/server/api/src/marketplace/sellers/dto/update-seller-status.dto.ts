import { SellerStatus } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class UpdateSellerStatusDto {
  @ApiProperty({
    description: 'New seller status',
    enum: SellerStatus,
    enumName: 'SellerStatus',
  })
  @IsEnum(SellerStatus)
  status!: SellerStatus;
}
