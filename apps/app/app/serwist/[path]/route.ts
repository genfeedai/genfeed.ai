import { serwist } from '@app/serwist/serwist-asset.core';
import {
  isSerwistRouteFile,
  SERWIST_ROUTE_FILES,
} from '@app/serwist/serwist-options';
import { readSerwistAsset } from 'genfeed-serwist-asset-reader';
import { notFound } from 'next/navigation';

type SerwistRouteContext = Parameters<typeof serwist.GET>[1];

export async function GET(request: Request, { params }: SerwistRouteContext) {
  const { path } = await params;
  if (!isSerwistRouteFile(path)) notFound();

  if (process.env.NODE_ENV === 'development') {
    return serwist.GET(request, { params: Promise.resolve({ path }) });
  }

  const file = await readSerwistAsset(path);
  return new Response(file.body, { headers: file.headers });
}

export async function generateStaticParams() {
  const generated = await serwist.generateStaticParams();
  const files = generated.map(({ path }) => path).sort();
  if (
    files.length !== SERWIST_ROUTE_FILES.length ||
    files.some((file, index) => file !== SERWIST_ROUTE_FILES[index])
  ) {
    throw new Error(
      `Serwist emitted ${files.join(', ')}; expected ${SERWIST_ROUTE_FILES.join(', ')}`,
    );
  }
  return SERWIST_ROUTE_FILES.map((path) => ({ path }));
}
