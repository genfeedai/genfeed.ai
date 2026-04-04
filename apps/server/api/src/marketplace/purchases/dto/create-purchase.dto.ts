import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePurchaseDto {
  @ApiProperty({
    description: 'ID of the listing to purchase',
  })
  @IsMongoId()
  listingId!: string;

  @ApiProperty({
    description: 'User ID of gift recipient (optional)',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  giftRecipientId?: string;

  @ApiProperty({
    description: 'Gift message (optional)',
    maxLength: 500,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  giftMessage?: string;

  @ApiProperty({
    description: 'Discount code (optional)',
    maxLength: 50,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  discountCode?: string;
}
