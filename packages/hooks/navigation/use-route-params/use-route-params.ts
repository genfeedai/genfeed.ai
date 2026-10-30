'use client';

import { useParams } from 'next/navigation';
import { useMemo } from 'react';

/**
 * Prefix Next gives to the opaque placeholder it substitutes for a dynamic
 * route param while it renders a prerendered fallback shell. It is never a
 * real tenant slug or id (#6303).
 */
const OPAQUE_ROUTE_PARAM_PREFIX = '%%drp:';

type RouteParamValue = string | string[] | undefined;

export function isOpaqueRouteParam(value: unknown): boolean {
  return (
    typeof value === 'string' && value.startsWith(OPAQUE_ROUTE_PARAM_PREFIX)
  );
}

/** Returns `value`, or `undefined` when it is an unresolved fallback param. */
export function stripOpaqueRouteParam<T extends string | undefined>(
  value: T,
): T | undefined {
  return isOpaqueRouteParam(value) ? undefined : value;
}

/**
 * Maps every unresolved fallback param to `undefined`: a string value becomes
 * `undefined`, and an array drops its opaque elements (an array left empty
 * becomes `undefined`).
 */
export function sanitizeRouteParams<
  T extends Record<string, RouteParamValue> = Record<string, RouteParamValue>,
>(params: T | null | undefined): Partial<T> {
  const sanitized: Record<string, RouteParamValue> = {};

  for (const [key, value] of Object.entries(params ?? {})) {
    if (Array.isArray(value)) {
      const resolved = value.filter((entry) => !isOpaqueRouteParam(entry));
      sanitized[key] = resolved.length > 0 ? resolved : undefined;
    } else {
      sanitized[key] = stripOpaqueRouteParam(value);
    }
  }

  return sanitized as Partial<T>;
}

/**
 * The only way app code reads dynamic route params. Wraps `useParams` so a
 * param that Next has not resolved yet (a prerendered fallback shell, see
 * `cacheComponents`) reads as `undefined`, never as a `%%drp:...%%` string
 * that could end up in a link or an API request. Callers render nothing, or
 * a skeleton, until the params they need are defined.
 */
export function useRouteParams<
  T extends Record<string, RouteParamValue> = Record<string, RouteParamValue>,
>(): Partial<T> {
  const params = useParams<T>();
  const paramsKey = JSON.stringify(params ?? {});

  // Keyed on content, not identity: the result stays referentially stable for
  // effect deps while an in-place param change still produces a new value.
  // biome-ignore lint/correctness/useExhaustiveDependencies: paramsKey is the serialized params
  return useMemo(() => sanitizeRouteParams<T>(params), [paramsKey]);
}
