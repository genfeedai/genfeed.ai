import { NEWSLETTER_PAID_PRICE_MAX_CREDITS } from '@genfeedai/contracts/constants';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Sending identity, footer and welcome email for one brand (#9723). */
export class UpdateNewsletterSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @ApiPropertyOptional({ description: 'Sender name shown in the inbox.' })
  readonly senderName?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @ApiPropertyOptional({ description: 'Reply-to address for issues.' })
  readonly replyTo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @ApiPropertyOptional({
    description: 'Postal address printed in every footer.',
  })
  readonly postalAddress?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiPropertyOptional({ description: 'Extra footer line.' })
  readonly footerText?: string | null;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: 'Send a welcome email on confirm.' })
  readonly isWelcomeEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @ApiPropertyOptional({ description: 'Welcome email subject.' })
  readonly welcomeSubject?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  @ApiPropertyOptional({ description: 'Welcome email body (Markdown).' })
  readonly welcomeBody?: string | null;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({
    description: '"Sent with Genfeed" footer link. Paid plans may turn it off.',
  })
  readonly isAttributionEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(NEWSLETTER_PAID_PRICE_MAX_CREDITS)
  @ApiPropertyOptional({ description: 'Monthly paid tier price in credits.' })
  readonly paidPriceCredits?: number | null;
}
