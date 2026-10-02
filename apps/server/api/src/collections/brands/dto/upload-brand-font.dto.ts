import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import { Transform } from 'class-transformer';
import {
  IsString,
  IsUUID,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';
export class UploadBrandFontDto {
  static readonly [FORBID_NON_WHITELISTED] = true;
  @IsUUID()
  @Matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )
  requestId!: string;
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @Matches(/^[\s\S]{1,256}$/)
  displayName?: string;
}
