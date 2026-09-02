import 'server-only';

import { isDesktopClient } from '@genfeedai/config/deployment';
import { DESKTOP_HTTP_HEADERS } from '@genfeedai/contracts/desktop';
import { headers } from 'next/headers';

export async function isDesktopServerRequest(): Promise<boolean> {
  if (isDesktopClient()) {
    return true;
  }

  const requestHeaders = await headers();
  return Boolean(requestHeaders.get(DESKTOP_HTTP_HEADERS.version)?.trim());
}
