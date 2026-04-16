import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateManagedCheckoutDto {
  @IsEmail()
  @ApiProperty({
    description: 'Email address used to provision the managed account',
  })
  readonly email!: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Optional first name for Clerk user creation',
    required: false,
  })
  readonly firstName?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Optional last name for Clerk user creation',
    required: false,
  })
  readonly lastName?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description:
      'Stripe price ID to use for checkout. Defaults to STRIPE_PRICE_PAYG.',
    required: false,
  })
  readonly stripePriceId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @ApiProperty({
    description: 'Quantity or credit-pack selector for the chosen Stripe price',
    required: false,
  })
  readonly quantity?: number;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'URL to redirect to after successful checkout',
    required: false,
  })
  readonly successUrl?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'URL to redirect to if checkout is cancelled',
    required: false,
  })
  readonly cancelUrl?: string;
}
