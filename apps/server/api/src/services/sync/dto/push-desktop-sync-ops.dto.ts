import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/**
 * Matches the desktop client's own push slice — it never sends more than 500
 * ops per request (`thread-sync.service.ts` `pendingOps.slice(0, 500)`), and it
 * drains the remainder on the next tick. Each op drives at least one write in
 * `desktop-sync.service.ts` `applySyncOps`.
 */
const MAX_SYNC_OPS = 500;

export class DesktopSyncOpDto {
  @IsString()
  createdAt!: string;

  @IsString()
  entityId!: string;

  @IsString()
  @IsIn(['workspace', 'brand', 'ingredient', 'asset', 'thread', 'workflow'])
  entityType!: string;

  @IsString()
  id!: string;

  @IsString()
  @IsIn(['create', 'delete', 'update'])
  operation!: string;

  @IsString()
  @IsOptional()
  payload?: string;

  @IsString()
  @IsIn(['acked', 'conflict', 'failed', 'pending', 'running'])
  status!: string;

  @IsString()
  updatedAt!: string;

  @IsString()
  @IsOptional()
  workspaceId?: string;
}

export class PushDesktopSyncOpsDto {
  @IsArray()
  @ArrayMaxSize(MAX_SYNC_OPS)
  @ValidateNested({ each: true })
  @Type(() => DesktopSyncOpDto)
  ops!: DesktopSyncOpDto[];
}
