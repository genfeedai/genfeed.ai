import { CreateCustomerDto } from '@api/collections/customers/dto/create-customer.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the customer is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
