import { HttpException, HttpStatus } from '@nestjs/common';

// `OrganizationModuleAccessService.reject` answers 403 for an organization that
// is not entitled to a module, and 503 when access could not be verified. Only
// the 403 is a deliberate, deterministic denial; the 503 stays retryable.
const MODULE_DENIAL_CODES: ReadonlySet<string> = new Set([
  'ORGANIZATION_MODULE_SUBSCRIPTION_REQUIRED',
  'ORGANIZATION_MODULE_UNRELEASED',
]);

export interface ModuleAccessDenial {
  code: string;
  moduleId: string;
}

export function readModuleAccessDenial(
  error: unknown,
): ModuleAccessDenial | null {
  if (!(error instanceof HttpException)) return null;
  if (error.getStatus() !== HttpStatus.FORBIDDEN) return null;
  const response = error.getResponse();
  if (typeof response !== 'object' || response === null) return null;
  const { code, moduleId } = response as Record<string, unknown>;
  if (typeof code !== 'string' || !MODULE_DENIAL_CODES.has(code)) return null;
  return {
    code,
    moduleId: typeof moduleId === 'string' ? moduleId : 'unknown',
  };
}
