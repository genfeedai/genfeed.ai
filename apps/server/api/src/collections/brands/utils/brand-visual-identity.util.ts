import type { UpdateBrandKitVisualIdentityDto } from '@api/collections/brands/dto/update-brand-kit-visual-identity.dto';
import { toPersistedFontFamily } from '@api/collections/brands/utils/persisted-font-family';
import {
  brandFontRolesSchema,
  brandPaletteSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-kit-style.contract';
import {
  BRAND_KIT_FIELD_OWNERSHIP,
  type IBrandKitDraft,
  type IBrandKitFieldOwner,
} from '@genfeedai/contracts/interfaces';
import { toPrismaJson } from '@genfeedai/prisma';
import { BadRequestException } from '@nestjs/common';

export function parseVisualIdentity(patch: UpdateBrandKitVisualIdentityDto) {
  const {
    backgroundColor,
    colorPalette,
    fontFamily,
    fontRoles,
    primaryColor,
    secondaryColor,
  } = patch;
  const styles = { backgroundColor, primaryColor, secondaryColor };
  if (
    Object.values(styles).some(
      (value) => value !== undefined && typeof value !== 'string',
    )
  )
    throw new BadRequestException('Invalid Brand Kit visual style');
  const persistedFontFamily = toPersistedFontFamily(fontFamily);
  if (fontFamily !== undefined && !persistedFontFamily)
    throw new BadRequestException('Invalid Brand Kit font family');
  const palette = brandPaletteSchema.optional().safeParse(colorPalette);
  const fonts = brandFontRolesSchema.optional().safeParse(fontRoles);
  if (!palette.success || !fonts.success)
    throw new BadRequestException('Invalid Brand Kit palette or font roles');
  const values = {
    ...styles,
    colorPalette: palette.data,
    fontFamily: persistedFontFamily,
    fontRoles: fonts.data,
  };
  if (Object.values(values).every((value) => value === undefined))
    throw new BadRequestException('At least one visual field is required');
  return values;
}

type VisualIdentity = ReturnType<typeof parseVisualIdentity>;

/** Writes the given values into the draft fields of one Brand Kit group. */
export function withOwnedFields(
  previous: IBrandKitDraft,
  group: IBrandKitFieldOwner['group'],
  values: object,
): IBrandKitDraft {
  const content = structuredClone(previous);
  for (const owner of BRAND_KIT_FIELD_OWNERSHIP) {
    if (owner.group !== group) continue;
    const value: unknown = Reflect.get(values, owner.key);
    if (value === undefined) continue;
    const field = content.fields[owner.key];
    content.fields[owner.key] = {
      ...owner,
      applyActionDefault: 'preserve',
      currentValue: value,
      diagnostics: [],
      evidence: [
        { label: 'Owner edit', sourceType: 'manual' },
        ...(field?.evidence.filter((entry) => entry.sourceType !== 'manual') ??
          []),
      ],
    };
  }
  return content;
}

export function withVisualIdentity(
  previous: IBrandKitDraft,
  values: VisualIdentity,
): IBrandKitDraft {
  return withOwnedFields(previous, 'visual', values);
}

export function brandVisualIdentityColumns(values: VisualIdentity) {
  const { colorPalette, fontRoles, ...styles } = values;
  return {
    ...styles,
    ...(colorPalette === undefined
      ? {}
      : { colorPalette: toPrismaJson(colorPalette) }),
    ...(fontRoles === undefined ? {} : { fontRoles: toPrismaJson(fontRoles) }),
  };
}
