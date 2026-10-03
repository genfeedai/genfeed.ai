import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import { IsInt, IsUUID, Min } from 'class-validator';
export class StartImportedSourceMediaDto {
  static readonly [FORBID_NON_WHITELISTED] = true;
  @IsUUID('4') requestId!: string;
}
export class RetryImportedSourceMediaDto {
  static readonly [FORBID_NON_WHITELISTED] = true;
  @IsUUID('4') requestId!: string;
  @IsInt() @Min(1) expectedIngestRevision!: number;
}
