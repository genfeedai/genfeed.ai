import { BadRequestException } from '@nestjs/common';

export function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function assertArticleOwnershipIds(
  userId: string,
  organizationId: string,
  brandId: string,
): void {
  // Precedence when more than one id is invalid: userId, then organizationId,
  // then brandId. Combined-invalid cases must keep this order (#3218).
  if (!userId || userId.trim() === '') {
    throw new BadRequestException('Invalid userId');
  }
  if (!organizationId || organizationId.trim() === '') {
    throw new BadRequestException('Invalid organizationId');
  }
  if (!brandId || brandId.trim() === '') {
    throw new BadRequestException('Invalid brandId');
  }
}
