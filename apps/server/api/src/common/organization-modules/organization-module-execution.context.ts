import { AsyncLocalStorage } from 'node:async_hooks';
import {
  ORGANIZATION_MODULES,
  type OrganizationModuleId,
} from '@genfeedai/contracts/constants';

export interface OrganizationModuleExecutionContext {
  moduleId: OrganizationModuleId;
  organizationId: string;
}

const storage = new AsyncLocalStorage<
  Readonly<OrganizationModuleExecutionContext>
>();

/** A server adapter sets this context after authentication and admission. */
export function runWithOrganizationModule<T>(
  context: OrganizationModuleExecutionContext,
  callback: () => T,
): T {
  if (
    !context.organizationId.trim() ||
    !Object.hasOwn(ORGANIZATION_MODULES, context.moduleId)
  )
    throw new Error('Authenticated module execution context is required');
  return storage.run(
    Object.freeze({
      moduleId: context.moduleId,
      organizationId: context.organizationId,
    }),
    callback,
  );
}

export function getOrganizationModuleExecutionContext():
  | Readonly<OrganizationModuleExecutionContext>
  | undefined {
  return storage.getStore();
}

/** Validate the server-written queue envelope before restoring its scope. */
export function parseOrganizationModuleExecutionContext(
  value: unknown,
  organizationId: string | undefined,
): Readonly<OrganizationModuleExecutionContext> | undefined {
  if (value === undefined) return undefined;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('organizationId' in value) ||
    typeof value.organizationId !== 'string' ||
    !value.organizationId.trim() ||
    value.organizationId !== organizationId ||
    !('moduleId' in value) ||
    typeof value.moduleId !== 'string' ||
    !Object.hasOwn(ORGANIZATION_MODULES, value.moduleId) ||
    Object.keys(value).some(
      (key) => key !== 'moduleId' && key !== 'organizationId',
    )
  ) {
    throw new Error('Invalid queued organization module execution context');
  }
  return Object.freeze({
    moduleId: value.moduleId as OrganizationModuleId,
    organizationId: value.organizationId,
  });
}
