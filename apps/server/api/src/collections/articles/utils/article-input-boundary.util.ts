import { BadRequestException } from '@nestjs/common';

export function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function assertArticleOwnershipIds(
  userId: string,
  organizationId: string,
  brandId: string,
): void {
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
