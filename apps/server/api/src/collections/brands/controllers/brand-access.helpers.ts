import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { type BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { BRAND_HANDLE_TAKEN_MESSAGE } from '@genfeedai/contracts/constants';
import { ConflictException, HttpException, HttpStatus } from '@nestjs/common';

export async function verifyBrandAccess(
  brandsService: Pick<BrandsService, 'findOne'>,
  brandId: string,
  user: User,
): Promise<BrandDocument> {
  const brand = await brandsService.findOne({
    id: brandId,
    OR: [
      { userId: user.userId ?? user.id },
      { organizationId: user.organizationId },
    ],
  });

  if (brand) {
    return brand;
  }

  if (!getIsSuperAdmin(user)) {
    throw new HttpException(
      {
        detail: 'Access denied to this brand',
        title: 'Forbidden',
      },
      HttpStatus.FORBIDDEN,
    );
  }

  throw new HttpException(
    {
      detail: 'Brand not found',
      title: 'Not Found',
    },
    HttpStatus.NOT_FOUND,
  );
}

/**
 * Preflight for a PATCH that carries a handle (a no-op without one). Access
 * comes first, so a caller cannot learn which handles are taken through a
 * brand they cannot edit. Superadmins may edit any live brand, as the default
 * patch allows. Relocations skip this: the relocation service authorizes both
 * organizations, then checks the handle.
 */
export async function assertBrandHandleAvailable(
  brandsService: Pick<BrandsService, 'findOne' | 'isSlugAvailable'>,
  params: {
    brandId: string;
    isSuperAdmin: boolean;
    slug: string | undefined;
    user: User;
  },
): Promise<void> {
  const { brandId, isSuperAdmin, slug, user } = params;
  if (slug === undefined) {
    return;
  }
  if (isSuperAdmin) {
    const brand = await brandsService.findOne({
      id: brandId,
      isDeleted: false,
    });
    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }
  } else {
    await verifyBrandAccess(brandsService, brandId, user);
  }

  if (!(await brandsService.isSlugAvailable(slug, brandId))) {
    throw new ConflictException(BRAND_HANDLE_TAKEN_MESSAGE);
  }
}
