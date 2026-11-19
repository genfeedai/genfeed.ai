import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isIP } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ISignupIpLocation } from '@genfeedai/contracts/interfaces';
import { Reader, type Response } from 'mmdb-lib';
import { z } from 'zod';

const IPV4_MAPPED_PREFIX = /^::ffff:(?=[0-9.]+$)/i;
const modulePath = fileURLToPath(import.meta.url);
const moduleDirectory = dirname(modulePath);
const nodeRequire = createRequire(modulePath);
// The bundled API runs from server/dist/apps/api. A local isolated install
// keeps the dataset in the sibling API workspace's node_modules.
const lookupPaths = [moduleDirectory, resolve(moduleDirectory, '../../../api')];
const readers = new Map<4 | 6, Promise<Reader<Response>>>();
const regionNames = new Intl.DisplayNames('en', {
  fallback: 'none',
  type: 'region',
});
const locationRecord = z.object({
  city: z.string().optional(),
  country_code: z.string().regex(/^[A-Z]{2}$/),
  state1: z.string().optional(),
});

async function loadCityReader(version: 4 | 6): Promise<Reader<Response>> {
  const path = nodeRequire.resolve(
    `@ip-location-db/dbip-city-mmdb/dbip-city-ipv${version}.mmdb`,
    { paths: lookupPaths },
  );
  return new Reader<Response>(await readFile(path));
}

export async function lookupSignupIpLocation(
  ipAddress: string,
): Promise<ISignupIpLocation | null> {
  const address = ipAddress.replace(IPV4_MAPPED_PREFIX, '');
  const version = isIP(address);
  if (version !== 4 && version !== 6) return null;

  const loading =
    readers.get(version) ??
    loadCityReader(version).catch((error: unknown) => {
      readers.delete(version);
      throw error;
    });
  readers.set(version, loading);
  const result = locationRecord.safeParse((await loading).get(address));
  if (!result.success) return null;

  const { city, country_code, state1 } = result.data;
  return {
    city: city || null,
    country: regionNames.of(country_code) ?? country_code,
    region: state1 || null,
  };
}
