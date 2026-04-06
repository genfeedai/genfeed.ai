'use client';

import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useEffect, useState } from 'react';

interface DesktopGateProps {
  children: React.ReactNode;
}

/**
 * DesktopGate - Blocks mobile users and shows a friendly message
 * Workflows editor is desktop-only for optimal experience
 */
export function DesktopGate({ children }: DesktopGateProps) {
  const { href } = useOrgUrl();
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.innerWidth < 1024;
  });

  useEffect(() => {
    const checkDevice = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  if (isMobile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-6">
          <div className="text-6xl">💻</div>
          <h1 className="text-2xl font-bold">Desktop Required</h1>
          <p className="text-muted-foreground">
            The Workflows editor requires a larger screen for the best
            experience. Please open this page on a desktop or laptop computer.
          </p>
          <p className="text-sm text-muted-foreground">
            Minimum screen width: 1024px
          </p>
          <a
            href={href('/overview')}
            className="inline-block bg-primary px-6 py-3 text-primary-foreground hover:bg-primary/90"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
