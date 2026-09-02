import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { type BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { HttpException, HttpStatus } from '@nestjs/common';

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
