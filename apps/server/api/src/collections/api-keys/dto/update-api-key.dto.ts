import {
  ApiKeyAllowedIpsField,
  ApiKeyExpiresAtField,
  ApiKeyScopesField,
} from '@api/collections/api-keys/dto/api-key-reach.decorators';
import { CreateApiKeyDto } from '@api/collections/api-keys/dto/create-api-key.dto';
import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * `PartialType` wraps every inherited field in `@IsOptional()`, which also
 * accepts JSON `null`. The three reach fields are taken out of the base and
 * re-declared with `@IsOmittable()`, so `null` is a 400 on update too (#7137).
 */
export class UpdateApiKeyDto extends PartialType(
  OmitType(CreateApiKeyDto, ['allowedIps', 'expiresAt', 'scopes'] as const),
) {
  @ApiKeyAllowedIpsField()
  @ApiProperty({
    description: 'IP addresses allowed to use this key',
    required: false,
  })
  readonly allowedIps?: string[];

  @ApiKeyExpiresAtField()
  @ApiProperty({ description: 'Expiration date for the key', required: false })
  readonly expiresAt?: string;

  @ApiKeyScopesField()
  @ApiProperty({
    description:
      'Scopes/permissions for this key. Must be a subset of the self-service scope presets.',
    isArray: true,
    required: false,
    type: String,
  })
  readonly scopes?: string[];

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the key is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
