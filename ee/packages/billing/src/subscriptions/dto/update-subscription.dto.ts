import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateSubscriptionDto } from './create-subscription.dto';

export class UpdateSubscriptionDto extends PartialType(CreateSubscriptionDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the subscription is marked as deleted',
    required: false,
  })
  readonly isDeleted!: boolean;
}
