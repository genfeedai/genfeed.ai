import { CreateSubscriptionDto } from '@api/collections/subscriptions/dto/create-subscription.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateSubscriptionDto extends PartialType(CreateSubscriptionDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the subscription is marked as deleted',
    required: false,
  })
  readonly isDeleted!: boolean;
}
