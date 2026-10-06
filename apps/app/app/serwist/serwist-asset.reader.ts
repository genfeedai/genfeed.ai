import { buildSerwistAsset } from '@app/serwist/serwist-asset.core';

export async function readSerwistAsset(
  file: Parameters<typeof buildSerwistAsset>[0],
) {
  return buildSerwistAsset(file);
}
