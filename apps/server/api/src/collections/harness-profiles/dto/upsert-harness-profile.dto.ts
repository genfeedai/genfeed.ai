import type { IHarnessAvoidFeedbackEntry } from '@genfeedai/contracts/interfaces';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpsertHarnessProfileDto {
  @IsString()
  brandId!: string;

  @IsString()
  label!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['brand', 'channel', 'company', 'founder'])
  scope!: 'brand' | 'channel' | 'company' | 'founder';

  @IsOptional()
  @IsIn(['active', 'draft'])
  status?: 'active' | 'draft';

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  platforms?: string[];

  @IsOptional()
  @IsObject()
  handles?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  audience?: string[];

  @IsOptional()
  @IsObject()
  thesis?: Record<string, string[]>;

  @IsOptional()
  @IsObject()
  voice?: Record<string, string | string[] | undefined>;

  @IsOptional()
  @IsObject()
  structure?: Record<string, string[]>;

  @IsOptional()
  @IsObject()
  examples?: Record<string, string[]>;

  /**
   * Auto-added anti-example audit trail (see `IHarnessAvoidFeedbackEntry`).
   * System-managed by `HarnessReviewFeedbackService`; not shallow-validated
   * per-entry, consistent with the other loosely-typed profile blocks above.
   */
  @IsOptional()
  @IsArray()
  avoidFeedback?: IHarnessAvoidFeedbackEntry[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  guardrails?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
