import { attachBrandCredentialRelations } from '@api/collections/brands/controllers/brand-credential-relations.helpers';
import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';

export async function decorateBrandResponse(
  brand: BrandDocument,
  brandsService: Pick<BrandsService, 'attachBrandKitAssetRelations'>,
  credentialsService: Pick<CredentialsService, 'find'>,
): Promise<BrandDocument> {
  // The brand's own org owns its assets — never the caller's session org,
  // which differs for a superadmin reading across tenants.
  const organizationId = brand.organizationId;

  if (typeof organizationId !== 'string' || !organizationId) {
    return brand;
  }

  // Reads run under the brand's own organization: a relocation response
  // carries the destination org and a superadmin reads across tenants.
  return runWithTenantContext({ organizationId }, async () =>
    attachBrandCredentialRelations(
      credentialsService,
      (
        await brandsService.attachBrandKitAssetRelations(
          [brand],
          organizationId,
        )
      )[0],
      organizationId,
    ),
  );
}
