import {
  MAX_REQUESTED_SKILL_SLUG_LENGTH,
  REQUESTED_SKILL_SLUG_PATTERN,
} from '@api/collections/skills/utils/requested-skill-slugs.util';
import {
  SKILL_PACKAGE_LIMITS,
  validateSkillPackageFiles,
} from '@api/collections/skills/utils/skill-package-archive.util';
import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import { BadRequestException } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from '@nestjs/swagger';
import { Transform, type TransformFnParams, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsString,
  Matches,
  MaxLength,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

function assertRawKeys(value: unknown, allowed: string[]): void {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).some((key) => !allowed.includes(key))
  ) {
    throw new BadRequestException('Skill package contains unknown fields');
  }
}

function preserveStrictPackage(params: TransformFnParams): unknown {
  // class-transformer intentionally discards prototype-related properties.
  // Check the raw shape first so the opt-in never silently filters input.
  const source = params.obj as unknown;
  assertRawKeys(source, [
    'slug',
    'sourceUrl',
    'expectedPackageChecksum',
    'package',
  ]);
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    const payload = (source as Record<string, unknown>).package;
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const record = payload as Record<string, unknown>;
      assertRawKeys(
        record,
        record.format === 'files'
          ? ['format', 'files']
          : record.format === 'zip'
            ? ['format', 'archiveBase64']
            : ['format'],
      );
      if (Array.isArray(record.files)) {
        if (record.files.length > SKILL_PACKAGE_LIMITS.entries)
          throw new BadRequestException(
            'Skill package contains too many files',
          );
        for (const file of record.files)
          assertRawKeys(file, ['path', 'content']);
      }
    }
  }
  return params.value as unknown;
}

@ValidatorConstraint({ name: 'skillPackageFiles', async: false })
class SkillPackageFilesConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    try {
      validateSkillPackageFiles(value);
      return true;
    } catch {
      return false;
    }
  }
  defaultMessage(): string {
    return 'files must be a bounded, safe skill package file list';
  }
}

@ValidatorConstraint({ name: 'skillPackageSourceUrl', async: false })
class SkillPackageSourceUrlConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (
      typeof value !== 'string' ||
      value !== value.trim() ||
      !value ||
      Buffer.byteLength(value, 'utf8') > 2000 ||
      [...value].some(
        (char) =>
          char.charCodeAt(0) < 32 ||
          (char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159),
      )
    )
      return false;
    try {
      const url = new URL(value);
      return (
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        !url.username &&
        !url.password &&
        !/^https?:\/*([^/?#]*)/i
          .exec(value.replaceAll('\\', '/'))?.[1]
          .includes('@')
      );
    } catch {
      return false;
    }
  }
  defaultMessage(): string {
    return 'sourceUrl must be bounded HTTP(S) provenance without userinfo or controls';
  }
}

@ValidatorConstraint({ name: 'skillPackageBase64', async: false })
class SkillPackageBase64Constraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (
      typeof value !== 'string' ||
      !value ||
      value.length > 1_333_336 ||
      value.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
    )
      return false;
    const bytes = Buffer.from(value, 'base64');
    return (
      bytes.length <= SKILL_PACKAGE_LIMITS.archiveBytes &&
      bytes.toString('base64') === value
    );
  }
  defaultMessage(): string {
    return 'archiveBase64 must be canonical, bounded standard base64';
  }
}

@ValidatorConstraint({ name: 'skillPackageFormat', async: false })
class SkillPackageFormatConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return false;
    const payload = value as Record<string, unknown>;
    const allowed =
      payload.format === 'files'
        ? ['format', 'files']
        : payload.format === 'zip'
          ? ['format', 'archiveBase64']
          : [];
    return (
      allowed.length > 0 &&
      Object.keys(payload).every((key) => allowed.includes(key))
    );
  }
  defaultMessage(): string {
    return 'package must contain exactly one files or ZIP payload';
  }
}

export class ImportSkillPackageFileDto {
  static readonly [FORBID_NON_WHITELISTED] = true;

  @IsString()
  @MaxLength(65_535)
  @ApiProperty({ type: String, maxLength: 65_535 })
  path!: string;

  @IsString()
  @MaxLength(SKILL_PACKAGE_LIMITS.entryBytes)
  @ApiProperty({ type: String, maxLength: SKILL_PACKAGE_LIMITS.entryBytes })
  content!: string;
}

export class ImportSkillPackagePayloadDto {
  static readonly [FORBID_NON_WHITELISTED] = true;

  @IsString()
  @IsIn(['files', 'zip'])
  @ApiProperty({ enum: ['files', 'zip'] })
  format!: 'files' | 'zip';
}

export class ImportSkillPackageFilesDto {
  static readonly [FORBID_NON_WHITELISTED] = true;

  @Equals('files')
  @ApiProperty({ enum: ['files'] })
  format!: 'files';

  @IsArray()
  @ArrayMaxSize(SKILL_PACKAGE_LIMITS.entries)
  @Validate(SkillPackageFilesConstraint)
  @ValidateNested({ each: true })
  @Type(() => ImportSkillPackageFileDto)
  @ApiProperty({
    type: ImportSkillPackageFileDto,
    isArray: true,
    maxItems: SKILL_PACKAGE_LIMITS.entries,
  })
  files!: ImportSkillPackageFileDto[];
}

export class ImportSkillPackageZipDto {
  static readonly [FORBID_NON_WHITELISTED] = true;

  @Equals('zip')
  @ApiProperty({ enum: ['zip'] })
  format!: 'zip';

  @IsString()
  @IsNotEmpty()
  @MaxLength(1_333_336)
  @Validate(SkillPackageBase64Constraint)
  @ApiProperty({ type: String, maxLength: 1_333_336 })
  archiveBase64!: string;
}

@ApiExtraModels(ImportSkillPackageFilesDto, ImportSkillPackageZipDto)
export class ImportSkillPackageDto {
  static readonly [FORBID_NON_WHITELISTED] = true;

  @IsString()
  @MaxLength(MAX_REQUESTED_SKILL_SLUG_LENGTH)
  @Matches(REQUESTED_SKILL_SLUG_PATTERN)
  @ApiProperty({ type: String, maxLength: MAX_REQUESTED_SKILL_SLUG_LENGTH })
  slug!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  @Validate(SkillPackageSourceUrlConstraint)
  @ApiPropertyOptional({ type: String, maxLength: 2000 })
  sourceUrl?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^(?:sha256:)?[a-fA-F0-9]{64}$/)
  @ApiPropertyOptional({ type: String })
  expectedPackageChecksum?: string;

  @IsObject()
  @Transform(preserveStrictPackage, { toClassOnly: true })
  @Validate(SkillPackageFormatConstraint)
  @ValidateNested()
  @Type(() => ImportSkillPackagePayloadDto, {
    discriminator: {
      property: 'format',
      subTypes: [
        { name: 'files', value: ImportSkillPackageFilesDto },
        { name: 'zip', value: ImportSkillPackageZipDto },
      ],
    },
    keepDiscriminatorProperty: true,
  })
  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(ImportSkillPackageFilesDto) },
      { $ref: getSchemaPath(ImportSkillPackageZipDto) },
    ],
  })
  package!: ImportSkillPackageFilesDto | ImportSkillPackageZipDto;
}
