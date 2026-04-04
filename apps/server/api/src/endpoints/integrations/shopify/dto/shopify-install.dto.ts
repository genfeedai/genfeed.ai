import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class ShopifyInstallDto {
  @ApiProperty({
    description: 'Shopify shop domain (e.g., mystore.myshopify.com)',
    example: 'mystore.myshopify.com',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+\.myshopify\.com$/, {
    message: 'Shop domain must be a valid Shopify domain',
  })
  shopDomain!: string;

  @ApiPropertyOptional({
    description: 'Shopify user ID of the shop owner',
    example: '12345678901234',
  })
  @IsString()
  @IsOptional()
  shopifyUserId?: string;
}
