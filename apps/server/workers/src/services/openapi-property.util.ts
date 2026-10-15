import { isRecord } from '@genfeedai/utils/data/extract.util';

/**
 * One input property with its local `$ref`, `allOf` and single non-null
 * `anyOf`/`oneOf` member merged in. Provider schemas keep enums in
 * `components.schemas` (`allOf: [{ $ref: '#/components/schemas/quality' }]`);
 * keys written on the property itself win over the referenced schema.
 */
export function resolveOpenapiProperty(
  property: Record<string, unknown>,
  openapi: Record<string, unknown>,
  seen = new Set<string>(),
): Record<string, unknown> {
  let resolved = property;
  const ref = property.$ref;
  if (typeof ref === 'string' && ref.startsWith('#/') && !seen.has(ref)) {
    let value: unknown = openapi;
    for (const segment of ref.slice(2).split('/'))
      value = isRecord(value)
        ? value[segment.replaceAll('~1', '/').replaceAll('~0', '~')]
        : undefined;
    if (isRecord(value))
      resolved = {
        ...resolveOpenapiProperty(value, openapi, new Set([...seen, ref])),
        ...property,
      };
  }
  if (Array.isArray(resolved.allOf))
    for (const child of resolved.allOf)
      if (isRecord(child))
        resolved = {
          ...resolveOpenapiProperty(child, openapi, seen),
          ...resolved,
        };
  const variants = resolved.anyOf ?? resolved.oneOf;
  if (Array.isArray(variants)) {
    const nonNull = variants.filter(
      (child) => isRecord(child) && child.type !== 'null',
    );
    if (nonNull.length === 1 && isRecord(nonNull[0]))
      resolved = {
        ...resolveOpenapiProperty(nonNull[0], openapi, seen),
        ...resolved,
      };
  }
  return resolved;
}

/** Every property of an input schema, resolved against its OpenAPI document. */
export function resolveOpenapiProperties(
  properties: Record<string, unknown>,
  openapi: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [
      key,
      isRecord(value) ? resolveOpenapiProperty(value, openapi) : value,
    ]),
  );
}
