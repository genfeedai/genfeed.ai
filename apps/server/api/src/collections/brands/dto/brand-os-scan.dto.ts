import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import type { IBrandOnboardingScanRequest } from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class BrandOsScanDto implements IBrandOnboardingScanRequest {
  static readonly [FORBID_NON_WHITELISTED] = true;
  @ApiProperty({ description: 'Website URL to scan', maxLength: 2048 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  url!: string;
  @ApiProperty({ description: 'Current scan request UUID' })
  @IsUUID()
  requestId!: string;
}
