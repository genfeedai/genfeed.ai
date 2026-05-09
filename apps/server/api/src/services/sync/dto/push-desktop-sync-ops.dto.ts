import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

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
  @ValidateNested({ each: true })
  @Type(() => DesktopSyncOpDto)
  ops!: DesktopSyncOpDto[];
}
