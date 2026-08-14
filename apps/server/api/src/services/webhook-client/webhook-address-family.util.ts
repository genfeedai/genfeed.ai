export function isIpv4LookupFamily(
  family: number | string | undefined,
): boolean {
  return family === 4 || family === 'IPv4';
}

export function isIpv6LookupFamily(
  family: number | string | undefined,
): boolean {
  return family === 6 || family === 'IPv6';
}

export function getRequestedAddressFamily(
  family: number | string | undefined,
): 4 | 6 | undefined {
  if (isIpv4LookupFamily(family)) {
    return 4;
  }

  if (isIpv6LookupFamily(family)) {
    return 6;
  }

  return undefined;
}
