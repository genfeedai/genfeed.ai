import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateMcpEnterpriseAuthDto {
  @IsBoolean()
  isEnabled!: boolean;

  /** Issuer URL of the IdP, or the organization's Claude issuer URL, exactly as it signs assertions. */
  @IsString()
  @MinLength(8)
  @MaxLength(2048)
  trustedIssuer!: string;
}
