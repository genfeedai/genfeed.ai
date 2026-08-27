import type { BrandKitFieldKey } from '@genfeedai/interfaces';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class ApplyBrandKitFieldDecisionDto {
  @IsIn(['accept', 'reject', 'preserve'])
  action!: 'accept' | 'reject' | 'preserve';

  @IsOptional()
  value?: unknown;

  @IsOptional()
  @IsString()
  assetCandidateId?: string;

  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean;
}

export class ApplyBrandKitDto {
  @IsOptional()
  @IsString()
  draftId?: string;

  @IsObject()
  fields!: Partial<Record<BrandKitFieldKey, ApplyBrandKitFieldDecisionDto>>;
}
