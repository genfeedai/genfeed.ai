import { getDeploymentFromRequestHeaders } from '@app-server/request-deployment.server';
import { readBetterAuthEnabledFromEnv } from '@genfeedai/auth-client/server';
import { connection } from 'next/server';
import { readGoogleSignInAvailableFromEnv } from '@/lib/runtime-config/google-sign-in-availability';
import { readMagicLinkAvailableFromEnv } from '@/lib/runtime-config/magic-link-availability';
import { createRuntimeAuthConfigSource } from '@/lib/runtime-config/runtime-config-source';

export async function GET(request: Request): Promise<Response> {
  await connection();

  const isCloud = getDeploymentFromRequestHeaders(request.headers) === 'cloud';
  const source = createRuntimeAuthConfigSource(
    readBetterAuthEnabledFromEnv(),
    readMagicLinkAvailableFromEnv(isCloud),
    readGoogleSignInAvailableFromEnv(isCloud),
  );

  return new Response(source, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/javascript; charset=utf-8',
    },
  });
}
