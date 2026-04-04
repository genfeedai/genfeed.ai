import type { ContentSignalType } from '@api/services/content-gateway/interfaces/content-gateway.interfaces';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

const SIGNAL_TYPES: ContentSignalType[] = [
  'cron',
  'trend_alert',
  'performance_threshold',
  'manual',
  'webhook',
];

export class RouteSignalDto {
  @IsString()
  readonly brandId!: string;

  @IsString()
  @IsOptional()
  readonly organizationId?: string;

  @IsIn(SIGNAL_TYPES)
  readonly type!: ContentSignalType;

  @IsObject()
  @IsOptional()
  readonly payload?: Record<string, unknown>;
}

export class ExecuteSkillDto {
  @IsString()
  readonly brandId!: string;

  @IsString()
  readonly skillSlug!: string;

  @IsObject()
  @IsOptional()
  readonly params?: Record<string, unknown>;
}
