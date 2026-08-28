import { type Brand, listBrands } from '@/api/brands';
import { getOrganizationId, setActiveBrand } from '@/config/store';
import { GenfeedError } from '@/utils/errors';

export async function readBrands(): Promise<Brand[]> {
  const organizationId = await getOrganizationId();
  if (!organizationId) {
    throw new GenfeedError(
      'No organization found',
      'Re-authenticate with `gf login` to link your organization'
    );
  }

  return await listBrands(organizationId);
}

export function resolveBrandReference(brands: Brand[], reference: string): Brand {
  const normalizedReference = reference.trim().toLocaleLowerCase();
  const matches = brands.filter(
    (brand) =>
      brand.id === reference ||
      brand.slug?.toLocaleLowerCase() === normalizedReference ||
      brand.label.toLocaleLowerCase() === normalizedReference
  );

  if (matches.length === 0) {
    throw new GenfeedError(
      `No brand matches "${reference}"`,
      'Run `gf brand list` to see available brands'
    );
  }

  if (matches.length > 1) {
    throw new GenfeedError(
      `"${reference}" matches more than one brand`,
      'Use the canonical brand id from `gf brand list`'
    );
  }

  return matches[0];
}

export async function activateBrand(reference: string): Promise<Brand> {
  const brand = resolveBrandReference(await readBrands(), reference);
  await setActiveBrand(brand.id);
  return brand;
}
