import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class CreateSubscriptionPreviewDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^price_[a-zA-Z0-9]+$/, {
    message: 'Invalid Stripe price ID format',
  })
  @ApiProperty({
    description: 'The price identifier for the subscription preview',
    required: true,
  })
  readonly price!: string;
}

export class CreateCheckoutSessionDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^price_[a-zA-Z0-9]+$/, {
    message: 'Invalid Stripe price ID format',
  })
  @ApiProperty({
    description: 'The Stripe price ID for the checkout session',
    required: true,
  })
  readonly stripePriceId!: string;

  @IsNumber()
  @Min(1000)
  @IsOptional()
  @Type(() => Number)
  @ApiProperty({
    default: 1000,
    description: 'The quantity/amount for the checkout session',
    minimum: 1000,
    required: false,
  })
  readonly quantity?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Custom success redirect URL after checkout',
    required: false,
  })
  readonly successUrl?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Custom cancel redirect URL for checkout',
    required: false,
  })
  readonly cancelUrl?: string;
}

export class CreateSubscriptionDto {
  @IsEntityId()
  @ApiProperty({
    description: 'The organization ID that owns the subscription',
    required: true,
  })
  readonly organizationId!: string;

  @IsEntityId()
  @ApiProperty({
    description: 'The customer ID associated with the subscription',
    required: true,
  })
  readonly customerId!: string;

  // admin user id
  @IsEntityId()
  @ApiProperty({
    description: 'The admin user ID who created the subscription',
    required: true,
  })
  readonly userId!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'The Stripe subscription ID', required: false })
  readonly stripeSubscriptionId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^price_[a-zA-Z0-9]+$/, {
    message: 'Invalid Stripe price ID format',
  })
  @ApiProperty({
    description: 'The Stripe price ID for this subscription',
    required: false,
  })
  readonly stripePriceId?: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The current status of the subscription',
    required: true,
  })
  readonly status!: string;

  @IsDate()
  @IsOptional()
  @ApiProperty({
    description: 'When the current billing period ends',
    required: false,
  })
  readonly currentPeriodEnd?: Date;

  @IsDate()
  @IsOptional()
  @ApiProperty({
    description: 'When the current billing period starts',
    required: false,
  })
  readonly currentPeriodStart?: Date;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the subscription will cancel at period end',
    required: false,
  })
  readonly cancelAtPeriodEnd?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The billing plan for the subscription',
    required: false,
  })
  readonly plan?: string;
}
