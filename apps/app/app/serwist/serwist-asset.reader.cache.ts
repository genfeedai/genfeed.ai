import { buildSerwistAsset } from '@app/serwist/serwist-asset.core';
import { cacheLife } from 'next/cache';

// Only the Desktop compiler resolves the route's reader to this module.
// Web builds keep Cache Components disabled and use the ordinary reader.
export async function readSerwistAsset(
  file: Parameters<typeof buildSerwistAsset>[0],
) {
  'use cache';
  cacheLife({ expire: Infinity, revalidate: Infinity });
  return buildSerwistAsset(file);
}
