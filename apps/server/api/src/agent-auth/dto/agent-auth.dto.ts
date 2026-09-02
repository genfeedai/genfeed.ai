import { SELF_SERVICE_API_KEY_SCOPES } from '@genfeedai/contracts/constants';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class RegisterAgentAuthDto {
  @ApiProperty({ enum: ['identity_assertion', 'service_auth'] })
  @IsIn(['identity_assertion', 'service_auth'])
  readonly type!: 'identity_assertion' | 'service_auth';

  @ApiPropertyOptional({ enum: ['verified_email'] })
  @ValidateIf((dto: RegisterAgentAuthDto) => dto.type === 'identity_assertion')
  @IsIn(['verified_email'])
  readonly assertion_type?: 'verified_email';

  @ApiPropertyOptional({ example: 'user@example.com' })
  @ValidateIf((dto: RegisterAgentAuthDto) => dto.type === 'identity_assertion')
  @IsEmail()
  readonly assertion?: string;

  @ApiPropertyOptional({ example: 'user@example.com' })
  @ValidateIf((dto: RegisterAgentAuthDto) => dto.type === 'service_auth')
  @IsEmail()
  readonly login_hint?: string;

  @ApiProperty({ enum: ['api_key'] })
  @IsIn(['api_key'])
  readonly requested_credential_type!: 'api_key';

  @ApiPropertyOptional({
    enum: SELF_SERVICE_API_KEY_SCOPES,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsIn([...SELF_SERVICE_API_KEY_SCOPES], { each: true })
  readonly requested_scopes?: string[];
}

export class CompleteAgentAuthClaimDto {
  @IsString()
  @MinLength(32)
  @Matches(/^[A-Za-z0-9_-]+$/)
  readonly claim_attempt_token!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  readonly user_code!: string;
}

export class InspectAgentAuthClaimDto {
  @IsString()
  @MinLength(32)
  @Matches(/^[A-Za-z0-9_-]+$/)
  readonly claim_attempt_token!: string;
}

export class ExchangeAgentAuthClaimDto {
  @IsString()
  @MinLength(32)
  @Matches(/^[A-Za-z0-9_-]+$/)
  readonly claim_token!: string;
}

export class RevokeAgentAuthCredentialDto {
  @IsString()
  @MinLength(32)
  @Matches(/^gf_(?:live|test)_[A-Za-z0-9_-]+$/)
  readonly token!: string;
}
