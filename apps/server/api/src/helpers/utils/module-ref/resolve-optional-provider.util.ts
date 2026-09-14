import type { Type } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';

export function resolveOptionalProvider<T>(
  moduleRef: ModuleRef | undefined,
  token: Type<T> | string | symbol,
): T | undefined {
  try {
    return moduleRef?.get<T>(token, { strict: false });
  } catch {
    return undefined;
  }
}
