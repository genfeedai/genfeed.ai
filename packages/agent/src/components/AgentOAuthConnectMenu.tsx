'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { OAUTH_CONNECT_PLATFORMS } from '@ui/constants/oauth-connect-platforms';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { type ReactElement, useCallback, useState } from 'react';
import { HiChevronDown, HiOutlineLink } from 'react-icons/hi2';

interface AgentOAuthConnectMenuProps {
  onOAuthConnect?: (platform: string) => void | Promise<void>;
}

const CONNECT_ERROR_MESSAGE =
  'Could not start the connection. Please try again.';

export function AgentOAuthConnectMenu({
  onOAuthConnect,
}: AgentOAuthConnectMenuProps): ReactElement | null {
  const [open, setOpen] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const handleConnect = useCallback(
    async (platform: string) => {
      if (!onOAuthConnect || connectingPlatform) {
        return;
      }

      setError(null);
      setConnectingPlatform(platform);

      try {
        await onOAuthConnect(platform);
        // A successful handoff normally replaces the current document. Closing
        // also restores the control when auth cancellation leaves us in place.
        setOpen(false);
      } catch {
        setError(CONNECT_ERROR_MESSAGE);
      } finally {
        setConnectingPlatform(null);
      }
    },
    [connectingPlatform, onOAuthConnect],
  );

  if (!onOAuthConnect) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          className="gen-shell-control flex items-center gap-1 rounded-md px-2 py-1 text-left"
          data-active={open ? 'true' : 'false'}
          ariaLabel="Connect a social channel"
        >
          <HiOutlineLink className="size-3.5 text-foreground/55" />
          <span className="text-[11px] font-medium text-foreground">
            Connect
          </span>
          <HiChevronDown
            className={cn(
              'size-3 text-foreground/42 transition-transform',
              open && 'rotate-180',
            )}
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={10}
        className="gen-shell-panel w-[20rem] rounded-[1.25rem] p-2 text-foreground shadow-[0_28px_70px_-48px_rgba(0,0,0,0.9)]"
      >
        <div className="px-2.5 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/42">
            Connect a channel
          </p>
          <p className="mt-1 text-xs text-foreground/58">
            Add a publishing destination without leaving your current work.
          </p>
        </div>

        {error ? (
          <p
            className="mx-2 mb-2 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-300"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <div className="grid max-h-72 grid-cols-2 gap-1 overflow-y-auto">
          {OAUTH_CONNECT_PLATFORMS.map((item) => (
            <Button
              key={item.platform}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => void handleConnect(item.platform)}
              isDisabled={connectingPlatform !== null}
              isLoading={connectingPlatform === item.platform}
              className="gen-shell-surface flex w-full items-center rounded-xl px-3 py-2 text-left text-xs font-medium text-foreground transition-colors"
            >
              {item.icon}
              {item.label}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
