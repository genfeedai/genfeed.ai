import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import type { ImportedSourceSnapshotInput } from '@genfeedai/contracts/api-types/contracts/imported-source.contract';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsUUID, Max, Min } from 'class-validator';
export class SaveImportedSourceDto {
  static readonly [FORBID_NON_WHITELISTED] = true;
  @IsObject() snapshot!: ImportedSourceSnapshotInput;
}
export class RecaptureImportedSourceDto {
  static readonly [FORBID_NON_WHITELISTED] = true;
  @IsUUID('4') requestId!: string;
}
export class ImportedSourcesQueryDto {
  static readonly [FORBID_NON_WHITELISTED] = true;
  @Type(() => Number) @IsInt() @Min(1) @Max(10000) @IsOptional() page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit = 20;
}
