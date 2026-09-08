import { ApplyBrandKitDto } from '@api/collections/brands/dto/apply-brand-kit.dto';
import type { IWarmupPrepareRequest } from '@genfeedai/contracts/interfaces';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PrepareWarmupAccountDto implements IWarmupPrepareRequest {
  @IsIn([
    'repair',
    'fund',
    'preview-context',
    'apply-context',
    'starter-content',
    'attach-starters',
    'archive',
  ])
  action!: IWarmupPrepareRequest['action'];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100000)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  sourceUrl?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  publicProfileUrl?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ApplyBrandKitDto)
  contextDecisions?: ApplyBrandKitDto;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  assetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  assetCandidateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  articleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  prompt?: string;
}
