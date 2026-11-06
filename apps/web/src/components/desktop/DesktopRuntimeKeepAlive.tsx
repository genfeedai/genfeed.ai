'use client';

import { desktopRuntimeService } from '@genfeedai/services/core/desktop-runtime.service';
import { useEffect } from 'react';

function holdRuntimeStore(): void {}

/**
 * Holds one listener on the desktop runtime store for the life of the
 * protected app, so the store reads the desktop bridge once per page.
 *
 * The store reads `getRuntimeContext` when its first listener arrives and
 * forgets the answer once the last one leaves. Every listener lives inside the
 * shell body, which unmounts whenever the routed organization is reconciled or
 * switched. Without this holder each of those remounts read the bridge again
 * and showed the runtime as loading until the new answer came back.
 *
 * Mounted in `protected-layout-client.tsx` beside `SessionKeepAlive`, above
 * the organization boundary. Renders nothing and never re-renders.
 */
export default function DesktopRuntimeKeepAlive(): null {
  useEffect(() => desktopRuntimeService.subscribe(holdRuntimeStore), []);

  return null;
}
