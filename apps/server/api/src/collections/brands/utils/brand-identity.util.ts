import type { UpdateBrandKitIdentityDto } from '@api/collections/brands/dto/update-brand-kit-identity.dto';
import { withOwnedFields } from '@api/collections/brands/utils/brand-visual-identity.util';
import type { IBrandKitDraft } from '@genfeedai/contracts/interfaces';
import { BadRequestException } from '@nestjs/common';

/** The brand name and description an owner sets, trimmed; a name cannot be blank. */
export function parseBrandIdentity(patch: UpdateBrandKitIdentityDto) {
  const { description, label } = patch;
  if (
    [label, description].some(
      (value) => value !== undefined && typeof value !== 'string',
    )
  )
    throw new BadRequestException('Invalid Brand Kit identity');
  const name = label?.trim();
  if (name === '') throw new BadRequestException('The brand name is required');
  const values = { description: description?.trim(), label: name };
  if (values.description === undefined && values.label === undefined)
    throw new BadRequestException('At least one identity field is required');
  return values;
}

type BrandIdentity = ReturnType<typeof parseBrandIdentity>;

export function withBrandIdentity(
  previous: IBrandKitDraft,
  values: BrandIdentity,
): IBrandKitDraft {
  return withOwnedFields(previous, 'profile', values);
}
