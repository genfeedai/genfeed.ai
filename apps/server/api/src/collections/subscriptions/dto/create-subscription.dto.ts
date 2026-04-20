import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDate,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
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
  @IsOptional()
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
  @IsMongoId()
  @ApiProperty({
    description: 'The organization ID that owns the subscription',
    required: true,
  })
  readonly organization!: string;

  @IsMongoId()
  @ApiProperty({
    description: 'The customer ID associated with the subscription',
    required: true,
  })
  readonly customer!: string;

  // admin user id
  @IsMongoId()
  @ApiProperty({
    description: 'The admin user ID who created the subscription',
    required: true,
  })
  readonly user!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'The Stripe customer ID', required: true })
  readonly stripeCustomerId!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'The Stripe subscription ID', required: true })
  readonly stripeSubscriptionId!: string;

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
    description: 'The type/category of the subscription',
    required: false,
  })
  readonly type?: string;
}
