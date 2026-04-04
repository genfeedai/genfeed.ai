import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty, IsString } from 'class-validator';
import { Types } from 'mongoose';

export class CreateCustomerDto {
  @IsMongoId()
  @ApiProperty({
    description: 'The organization ID that the customer belongs to',
    required: true,
  })
  readonly organization!: Types.ObjectId;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The unique Stripe customer identifier',
    required: true,
  })
  readonly stripeCustomerId!: string;
}
