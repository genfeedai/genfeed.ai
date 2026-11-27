/**
 * Serves the shared client marks from the MCP origin at `/assets/clients/<id>.svg`.
 */

import { CLIENT_LOGO_SVGS } from '@genfeedai/helpers/integrations/connect-client-logos.helper';
import type { ConnectClientMarkId } from '@genfeedai/helpers/integrations/connect-genfeed-clients.helper';

type ClientLogoId = ConnectClientMarkId;

export const CLIENT_LOGO_PATH_PREFIX = '/assets/clients/';

export function resolveClientLogo(pathname: string): string | null {
  if (
    !pathname.startsWith(CLIENT_LOGO_PATH_PREFIX) ||
    !pathname.endsWith('.svg')
  ) {
    return null;
  }
  const id = pathname.slice(CLIENT_LOGO_PATH_PREFIX.length, -'.svg'.length);
  return Object.hasOwn(CLIENT_LOGO_SVGS, id)
    ? CLIENT_LOGO_SVGS[id as ClientLogoId]
    : null;
}
