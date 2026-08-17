'use client';

import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

const PLAYWRIGHT_TEST_COOKIE_NAME = '__playwright_test';
const PLAYWRIGHT_BANNER_COOKIE_NAME = '__genfeed_playwright_banner';

export const productionDataBannerRuntime = {
  getCookieHeader(): string {
    if (typeof document === 'undefined') {
      return '';
    }

    return document.cookie;
  },
  getHostname(): string {
    if (typeof window === 'undefined') {
      return '';
    }

    return window.location.hostname;
  },
  getPublicEnv(
    name: 'NEXT_PUBLIC_PLAYWRIGHT_TEST' | 'NEXT_PUBLIC_PLAYWRIGHT_BANNER_SKIP',
  ): string | undefined {
    const env = process.env as Record<string, string | undefined>;
    return env[name];
  },
};

function isLocalhost(): boolean {
  const hostname = productionDataBannerRuntime.getHostname();
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('local.')
  );
}

function hasCookie(name: string): boolean {
  return productionDataBannerRuntime
    .getCookieHeader()
    .split(';')
    .some((part) => {
      const trimmed = part.trim();
      return trimmed === name || trimmed.startsWith(`${name}=`);
    });
}

function isEnabledPublicEnv(
  name: 'NEXT_PUBLIC_PLAYWRIGHT_TEST' | 'NEXT_PUBLIC_PLAYWRIGHT_BANNER_SKIP',
): boolean {
  return productionDataBannerRuntime.getPublicEnv(name) === 'true';
}

function isPlaywrightRun(): boolean {
  if (isEnabledPublicEnv('NEXT_PUBLIC_PLAYWRIGHT_TEST')) {
    return true;
  }

  if (isEnabledPublicEnv('NEXT_PUBLIC_PLAYWRIGHT_BANNER_SKIP')) {
    return true;
  }

  return (
    hasCookie(PLAYWRIGHT_TEST_COOKIE_NAME) ||
    hasCookie(PLAYWRIGHT_BANNER_COOKIE_NAME)
  );
}

export default function ProductionDataBanner() {
  const [isProductionData, setIsProductionData] = useState(false);

  useEffect(() => {
    if (!isLocalhost() || isPlaywrightRun()) {
      return;
    }

    const controller = new AbortController();

    async function checkDbMode() {
      try {
        const response = await fetch(
          `${EnvironmentService.apiEndpoint}/system/db-mode`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          return;
        }

        const data: { mode: string } = await response.json();
        setIsProductionData(data.mode === 'production');
      } catch {
        // Endpoint not available or request aborted — default to no banner
      }
    }

    checkDbMode();

    return () => controller.abort();
  }, []);

  if (!isProductionData) {
    return null;
  }

  return (
    <div
      role="alert"
      data-testid="production-data-banner"
      className="flex w-full items-center justify-center gap-2 bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground"
    >
      <TriangleAlert className="size-5 shrink-0" />
      <span>PRODUCTION DATA: Read carefully before making changes</span>
    </div>
  );
}
