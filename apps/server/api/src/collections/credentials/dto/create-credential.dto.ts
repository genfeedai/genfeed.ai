import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { CredentialPlatform } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateCredentialVerifyDto {
  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly code?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly state?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly oauthToken?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly oauthVerifier?: string;
}

export class ConnectCredentialDto {
  @IsEntityId()
  @ApiProperty({ required: true })
  readonly brandId!: string;
}

export class CreateCredentialDto {
  @IsEntityId()
  @ApiProperty({ required: true })
  readonly userId!: string;

  @IsEntityId()
  @ApiProperty({ required: true })
  readonly brandId!: string;

  @IsEntityId()
  @ApiProperty({ required: true })
  readonly organizationId!: string;

  @ApiProperty({
    enum: CredentialPlatform,
    enumName: 'CredentialPlatform',
    example: CredentialPlatform.YOUTUBE,
  })
  @IsEnum(CredentialPlatform)
  @IsNotEmpty()
  readonly platform!: CredentialPlatform;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly externalId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly externalHandle?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly externalName?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly externalAvatar?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly oauthState?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly oauthToken?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly oauthTokenSecret?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly accessToken?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly accessTokenSecret?: string;

  @IsDateString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly accessTokenExpiry?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly refreshToken?: string;

  @IsDateString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly refreshTokenExpiry?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly label?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly description?: string;

  @IsArray()
  @IsEntityId({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Array of tag IDs',
    required: false,
    type: [String],
  })
  readonly tagIds?: string[];

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly isConnected?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Provider-granted OAuth scopes captured at connect or refresh',
    required: false,
    type: [String],
  })
  readonly grantedScopes?: string[];

  @IsOptional()
  @ApiProperty({
    description:
      'When grantedScopes were last written. Null means they were never captured.',
    required: false,
  })
  readonly grantedScopesCapturedAt?: Date;
}
