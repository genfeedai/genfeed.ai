import { PurchaseQueryDto } from '@api/marketplace/purchases/dto/purchase-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AdminPurchaseQueryDto extends PurchaseQueryDto {
  @ApiProperty({
    description:
      'Search purchases by listing title, seller display name, or stripe session',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;
}
