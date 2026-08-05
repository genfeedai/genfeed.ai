import { ConnectCredentialDto } from '@api/collections/credentials/dto/create-credential.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class ConnectShopifyCredentialDto extends ConnectCredentialDto {
  @ApiProperty({
    description: 'Canonical Shopify store domain',
    example: 'acme.myshopify.com',
  })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{0,62}\.myshopify\.com$/i)
  readonly shop!: string;
}
