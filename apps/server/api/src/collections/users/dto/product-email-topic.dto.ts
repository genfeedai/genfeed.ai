import {
  PRODUCT_EMAIL_TOPICS,
  type ProductEmailTopic,
} from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class ProductEmailTopicDto {
  @ApiProperty({ enum: PRODUCT_EMAIL_TOPICS })
  @IsIn(PRODUCT_EMAIL_TOPICS)
  readonly topic!: ProductEmailTopic;
}
