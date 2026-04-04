'use client';

import { EnvironmentService } from '@services/core/environment.service';
import { useEffect, useState } from 'react';
import { HiExclamationTriangle } from 'react-icons/hi2';

function isLocalhost(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const { hostname } = window.location;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('local.')
  );
}

export default function ProductionDataBanner() {
  const [isProductionData, setIsProductionData] = useState(false);

  useEffect(() => {
    if (!isLocalhost()) {
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
      className="flex w-full items-center justify-center gap-2 bg-red-600 px-4 py-2 text-sm font-bold text-white"
    >
      <HiExclamationTriangle className="h-5 w-5 shrink-0" />
      <span>PRODUCTION DATA — Read carefully before making changes</span>
    </div>
  );
}
