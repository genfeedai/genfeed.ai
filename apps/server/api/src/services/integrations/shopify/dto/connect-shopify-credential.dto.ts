import { ConnectCredentialDto } from '@api/collections/credentials/dto/create-credential.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

const MYSHOPIFY_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}\.myshopify\.com$/i;

export class ConnectShopifyCredentialDto extends ConnectCredentialDto {
  @ApiProperty({
    description: 'Canonical Shopify store domain',
    example: 'acme.myshopify.com',
  })
  @IsString()
  @Matches(MYSHOPIFY_DOMAIN_PATTERN)
  readonly shop!: string;
}
