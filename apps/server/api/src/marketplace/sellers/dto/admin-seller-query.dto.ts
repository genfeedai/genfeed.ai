import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { SellerStatus } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class AdminSellerQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Filter sellers by status',
    enum: SellerStatus,
    enumName: 'SellerStatus',
    required: false,
  })
  @IsOptional()
  @IsEnum(SellerStatus)
  status?: SellerStatus;

  @ApiProperty({
    description: 'Search sellers by display name or slug',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;
}
