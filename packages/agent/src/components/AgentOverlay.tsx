import { AgentPanel } from '@genfeedai/agent/components/AgentPanel';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import Button from '@ui/buttons/base/Button';
import { usePathname } from 'next/navigation';
import { type ReactElement, useCallback, useState } from 'react';
import { HiOutlineSparkles, HiOutlineXMark } from 'react-icons/hi2';

interface AgentOverlayProps {
  apiService: AgentApiService;
  onNavigateToBilling?: () => void;
  onOAuthConnect?: (platform: string) => void;
  onSelectCreditPack?: (pack: {
    label: string;
    price: string;
    credits: number;
  }) => void;
}

/**
 * Overlay drawer for focus tools (studio, editor, workflow).
 * Slides in from the right edge, doesn't push content.
 */
export function AgentOverlay({
  apiService,
  onNavigateToBilling,
  onOAuthConnect,
  onSelectCreditPack,
}: AgentOverlayProps): ReactElement | null {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  if (pathname.startsWith('/chat')) {
    return null;
  }

  return (
    <>
      {/* Toggle button — sits in a fixed position */}
      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onClick={handleToggle}
        className={cn(
          'fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-200',
          isOpen
            ? 'bg-foreground/10 text-foreground hover:bg-foreground/20'
            : 'bg-primary text-primary-foreground hover:scale-105',
        )}
        aria-label={isOpen ? 'Close agent' : 'Open agent'}
      >
        {isOpen ? (
          <HiOutlineXMark className="h-5 w-5" />
        ) : (
          <HiOutlineSparkles className="h-5 w-5" />
        )}
      </Button>

      {/* Backdrop */}
      {isOpen && (
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          onClick={handleClose}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          aria-label="Close agent overlay"
        />
      )}

      {/* Drawer panel */}
      <aside
        className={cn(
          'fixed right-0 top-0 z-50 h-screen w-[400px] max-w-[90vw] border-l border-white/[0.06] bg-background shadow-2xl transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <AgentPanel
          apiService={apiService}
          onNavigateToBilling={onNavigateToBilling}
          onOAuthConnect={onOAuthConnect}
          onSelectCreditPack={onSelectCreditPack}
        />
      </aside>
    </>
  );
}
