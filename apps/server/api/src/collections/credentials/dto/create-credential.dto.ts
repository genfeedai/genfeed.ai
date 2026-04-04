import { CredentialPlatform } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Types } from 'mongoose';

export class CreateCredentialVerifyDto {
  @IsString()
  @ApiProperty({ required: false })
  readonly code?: string;

  @IsString()
  @ApiProperty({ required: false })
  readonly state?: string;

  @IsString()
  @ApiProperty({ required: false })
  readonly oauthToken?: string;

  @IsString()
  @ApiProperty({ required: false })
  readonly oauthVerifier?: string;

  @IsString()
  @ApiProperty({ required: false })
  readonly userId?: string;

  @IsString()
  @ApiProperty({ required: false })
  readonly brand?: Types.ObjectId;
}

export class CreateCredentialDto {
  @IsMongoId()
  @ApiProperty({ required: true })
  readonly user!: Types.ObjectId;

  @IsMongoId()
  @ApiProperty({ required: true })
  readonly brand!: Types.ObjectId;

  @IsMongoId()
  @ApiProperty({ required: true })
  readonly organization!: Types.ObjectId;

  @ApiProperty({
    enum: CredentialPlatform,
    enumName: 'CredentialPlatform',
    example: CredentialPlatform.YOUTUBE,
  })
  @IsEnum(CredentialPlatform)
  @IsNotEmpty()
  readonly platform!: CredentialPlatform;

  @IsString()
  @ApiProperty({ required: false })
  readonly externalId!: string;

  @IsString()
  @ApiProperty({ required: false })
  readonly externalHandle!: string;

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
  @ApiProperty({ required: false })
  readonly oauthToken!: string;

  @IsString()
  @ApiProperty({ required: false })
  readonly oauthTokenSecret!: string;

  @IsString()
  @ApiProperty({ required: false })
  readonly accessToken!: string;

  @IsString()
  @ApiProperty({ required: false })
  readonly accessTokenSecret!: string;

  @IsString()
  @ApiProperty({ required: false })
  readonly accessTokenExpiry!: Date;

  @IsString()
  @ApiProperty({ required: false })
  readonly refreshToken!: string;

  @IsString()
  @ApiProperty({ required: false })
  readonly refreshTokenExpiry!: Date;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly label?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly description?: string;

  @IsArray()
  @IsOptional()
  @ApiProperty({
    description: 'Array of tag IDs',
    required: false,
    type: [Types.ObjectId],
  })
  readonly tags?: Types.ObjectId[];

  @IsBoolean()
  @ApiProperty({ required: false })
  readonly isConnected!: boolean;
}
