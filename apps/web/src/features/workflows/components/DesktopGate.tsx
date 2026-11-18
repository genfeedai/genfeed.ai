'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import { Monitor } from 'lucide-react';
import Link from 'next/link';
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

  // use-effect-audit: ignore subscribes to browser events
  useEffect(() => {
    const checkDevice = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  return isMobile ? (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <EmptyState
        actions={
          <Button asChild variant={ButtonVariant.DEFAULT} withWrapper={false}>
            <Link href={href(APP_ROUTES.WORKSPACE.OVERVIEW)}>
              Open Overview
            </Link>
          </Button>
        }
        description="The Workflows editor needs a screen at least 1024px wide. Open this page on a desktop or laptop computer."
        icon={Monitor}
        title="Desktop Required"
      />
    </div>
  ) : (
    children
  );
}
