import { CreateCredentialDto } from '@api/collections/credentials/dto/create-credential.dto';
import { ApiProperty, PartialType, PickType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateCredentialDto extends PartialType(
  PickType(CreateCredentialDto, [
    'accessToken',
    'accessTokenExpiry',
    'accessTokenSecret',
    'description',
    'externalAvatar',
    'externalHandle',
    'externalId',
    'externalName',
    'grantedScopes',
    'grantedScopesCapturedAt',
    'isConnected',
    'label',
    'oauthToken',
    'oauthTokenSecret',
    'refreshToken',
    'refreshTokenExpiry',
    'tagIds',
  ] as const),
) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the credential is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
