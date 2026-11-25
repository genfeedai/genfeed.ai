import { ManualBrandKitDto } from '@api/collections/brands/dto/manual-brand-kit.dto';
import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import type {
  BrandFontRoles,
  BrandPaletteColor,
} from '@genfeedai/contracts/api-types/contracts/brand-kit-style.contract';
import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsArray, IsObject, ValidateIf } from 'class-validator';

export class UpdateBrandKitVisualIdentityDto extends PickType(
  ManualBrandKitDto,
  [
    'backgroundColor',
    'fontFamily',
    'primaryColor',
    'secondaryColor',
    'visualDirection',
  ] as const,
) {
  static readonly [FORBID_NON_WHITELISTED] = true;

  @ApiPropertyOptional({ type: [Object] })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  colorPalette?: BrandPaletteColor[];

  @ApiPropertyOptional({ type: Object })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsObject()
  fontRoles?: BrandFontRoles;
}
