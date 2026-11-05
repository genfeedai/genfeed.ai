import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import { Transform } from 'class-transformer';
import {
  IsString,
  IsUUID,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BOUNDED_TEXT_PATTERN = /^[\s\S]{1,256}$/;

export class UploadBrandFontDto {
  static readonly [FORBID_NON_WHITELISTED] = true;
  @IsUUID()
  @Matches(UUID_PATTERN)
  requestId!: string;
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @Matches(BOUNDED_TEXT_PATTERN)
  displayName?: string;
}
