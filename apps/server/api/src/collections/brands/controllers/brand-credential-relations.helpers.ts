import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { fromPrismaCredentialPlatform } from '@genfeedai/contracts';

/**
 * Resolve the brand's connected accounts onto the response.
 *
 * `brandSerializerConfig` declares `credentials` as a relation, but nothing
 * ever populated it — `findOne`/`findOneBySlug` fetch the brand row with no
 * populate — so every brand came back with zero connected accounts and brand
 * social settings reported "Not connected" for platforms that are linked.
 *
 * `platform` crosses to the domain vocabulary here: the column is the
 * SCREAMING `CredentialPlatform` Prisma enum, while the UI, posts and OAuth
 * routes all speak the lowercase domain `Platform` ids.
 */
export async function attachBrandCredentialRelations(
  credentialsService: Pick<CredentialsService, 'find'>,
  brand: BrandDocument,
  organizationId: string,
): Promise<BrandDocument> {
  const credentials = await credentialsService.find({
    brandId: String(brand.id),
    isDeleted: false,
    organizationId,
  });

  // Copy rather than assign onto the argument: the brand row reaching here is
  // whatever the service returned, and mutating it writes the relation into
  // any cache entry or caller-held reference pointing at the same object.
  return {
    ...brand,
    credentials: credentials.map((credential) => ({
      ...credential,
      platform:
        fromPrismaCredentialPlatform(credential.platform) ??
        credential.platform,
    })),
  };
}
