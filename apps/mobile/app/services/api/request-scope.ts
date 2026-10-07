import { ApiRequestError, apiRequest } from '@/services/api/base-http.service';

export interface RequestScope {
  brandId: string;
  organizationId: string;
}

let cachedScope: { scope: RequestScope; token: string } | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readScope(payload: unknown): RequestScope | null {
  if (!isRecord(payload) || !isRecord(payload.access)) {
    return null;
  }

  const organizationId = payload.access.organizationId;
  const brandId = payload.access.brandId;
  if (typeof organizationId !== 'string' || organizationId.trim() === '') {
    return null;
  }

  if (typeof brandId !== 'string' || brandId.trim() === '') {
    return null;
  }

  return {
    brandId: brandId.trim(),
    organizationId: organizationId.trim(),
  };
}

export async function loadRequestScope(token: string): Promise<RequestScope> {
  if (cachedScope?.token === token) {
    return cachedScope.scope;
  }

  const payload = await apiRequest<unknown>(token, 'auth/bootstrap');
  const scope = readScope(payload);
  if (!scope) {
    throw new ApiRequestError(
      403,
      'An organization and brand are required before this workspace can load.',
    );
  }

  cachedScope = { scope, token };
  return scope;
}
