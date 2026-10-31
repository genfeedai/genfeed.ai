import 'server-only';

import {
  type Deployment,
  getDeploymentFromRequestHost,
} from '@genfeedai/config/deployment';
import { headers } from 'next/headers';

/**
 * The deployment for the request with these headers. In production the request
 * host alone decides Cloud (`*.genfeed.ai`), so no env variable can flip it.
 */
export function getDeploymentFromRequestHeaders(
  requestHeaders: Pick<Headers, 'get'>,
): Deployment {
  return getDeploymentFromRequestHost(
    requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host'),
  );
}

/** {@link getDeploymentFromRequestHeaders} for the request being rendered. */
export async function getRequestDeployment(): Promise<Deployment> {
  return getDeploymentFromRequestHeaders(await headers());
}
