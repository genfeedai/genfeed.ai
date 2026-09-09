import { parsePlatform } from '@genfeedai/contracts';
import type { IBrand, ICredential } from '@genfeedai/contracts/interfaces';
import type { PlatformPreviewAuthor } from './PlatformPreview.types';

export interface PreviewAuthorScope {
  brandId: string;
  organizationId: string;
  selectedBrand?: Pick<IBrand, 'id' | 'organizationId' | 'label' | 'logoUrl'>;
  credentials: ICredential[];
}

export interface PreviewAuthorRequest {
  platform?: string;
  credentialId?: string;
  brandId?: string | null;
}

export function resolvePreviewAuthor(
  scope: PreviewAuthorScope,
  request: PreviewAuthorRequest,
): PlatformPreviewAuthor | undefined {
  if (
    !scope.brandId ||
    !scope.organizationId ||
    (request.brandId && request.brandId !== scope.brandId)
  )
    return undefined;
  const brand =
    scope.selectedBrand?.id === scope.brandId &&
    scope.selectedBrand.organizationId === scope.organizationId
      ? scope.selectedBrand
      : undefined;
  const platform = request.platform
    ? parsePlatform(request.platform)
    : undefined;
  const credentials = scope.credentials.filter(
    (credential) =>
      credential.brandId === scope.brandId &&
      credential.organizationId === scope.organizationId &&
      credential.isConnected &&
      !credential.isDeleted &&
      credential.platform === platform,
  );
  const credential = request.credentialId
    ? credentials.find((candidate) => candidate.id === request.credentialId)
    : credentials.length === 1
      ? credentials[0]
      : undefined;
  if (!credential && !brand) return undefined;
  return {
    avatarUrl: credential?.externalAvatar?.trim() || brand?.logoUrl,
    handle: credential?.externalHandle?.trim() || undefined,
    name:
      credential?.externalName?.trim() ||
      credential?.label?.trim() ||
      brand?.label,
  };
}
