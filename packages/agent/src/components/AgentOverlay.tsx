import { AgentPanel } from '@genfeedai/agent/components/AgentPanel';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@ui/primitives/dialog';
import { Sparkles } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactElement, useState } from 'react';

interface AgentOverlayProps {
  apiService: AgentApiService;
  onNavigateToBilling?: () => void;
  onOAuthConnect?: (platform: string) => void;
}

/**
 * Overlay drawer for focus tools (studio, editor, workflow).
 * Slides in from the right edge, doesn't push content.
 */
export function AgentOverlay({
  apiService,
  onNavigateToBilling,
  onOAuthConnect,
}: AgentOverlayProps): ReactElement | null {
  const translate = useTranslations('agent.chrome');
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  if (pathname.startsWith(APP_ROUTES.AGENT.ROOT)) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {/* Launcher: a fixed button that opens the drawer. */}
      <DialogTrigger asChild>
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          className="fixed bottom-6 right-6 z-40 flex size-12 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-lg transition-transform duration-200 hover:scale-105"
          aria-label={translate('openAgent')}
        >
          <Sparkles className="size-5" />
        </Button>
      </DialogTrigger>

      <DialogContent
        aria-describedby={undefined}
        className="w-[400px] max-w-[90vw] gap-0 border-l border-foreground/5 p-0"
        placement="right"
      >
        <DialogTitle className="sr-only">{translate('title')}</DialogTitle>
        <AgentPanel
          apiService={apiService}
          onNavigateToBilling={onNavigateToBilling}
          onOAuthConnect={onOAuthConnect}
        />
      </DialogContent>
    </Dialog>
  );
}
