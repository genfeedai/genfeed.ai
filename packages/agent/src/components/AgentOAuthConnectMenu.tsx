'use client';

import { type ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useOAuthConnectPlatforms } from '@hooks/auth/use-oauth-connect-platforms/use-oauth-connect-platforms';
import {
  groupOAuthConnectPlatforms,
  type ResolvedOAuthConnectPlatform,
  resolveOAuthServicePath,
} from '@ui/constants/oauth-connect-platforms';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { ChevronDown, Link } from 'lucide-react';
import { type ReactElement, useCallback, useMemo, useState } from 'react';

import { AgentErrorMessage } from './AgentErrorMessage';

interface AgentOAuthConnectMenuProps {
  onOAuthConnect?: (platform: string) => void | Promise<void>;
  /** Hide platforms that are already connected on this brand. */
  excludePlatforms?: ReadonlySet<string>;
  /** Popover alignment. Toolbar uses `end`; setup cards use `start`. */
  contentAlign?: 'end' | 'start';
  /** Trigger label. Defaults to the compact agent "Connect" control. */
  triggerLabel?: string;
  triggerClassName?: string;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  /** Hide the leading link icon (e.g. full empty-state CTA). */
  hideIcon?: boolean;
}

const CONNECT_ERROR_MESSAGE =
  'Could not start the connection. Please try again.';

export function AgentOAuthConnectMenu({
  onOAuthConnect,
  excludePlatforms,
  contentAlign = 'end',
  triggerLabel = 'Connect',
  triggerClassName,
  triggerVariant = ButtonVariant.UNSTYLED,
  triggerSize,
  hideIcon = false,
}: AgentOAuthConnectMenuProps): ReactElement | null {
  const [open, setOpen] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const catalog = useOAuthConnectPlatforms();
  const platforms = useMemo(
    () =>
      catalog.filter(
        (item) =>
          item.isConnectAvailable && !excludePlatforms?.has(item.platform),
      ),
    [catalog, excludePlatforms],
  );
  const groups = useMemo(
    () => groupOAuthConnectPlatforms(platforms),
    [platforms],
  );

  const handleConnect = useCallback(
    async (item: ResolvedOAuthConnectPlatform) => {
      if (!onOAuthConnect || !item.isConnectAvailable || connectingPlatform) {
        return;
      }

      const connectKey = item.connectId ?? item.platform;
      setError(null);
      setConnectingPlatform(connectKey);

      try {
        // Pass Nest service path (google-ads), not enum (google_ads).
        await onOAuthConnect(
          resolveOAuthServicePath(item.platform, item.servicePath),
        );
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

  if (!onOAuthConnect || platforms.length === 0) {
    return null;
  }

  const isShellControl = triggerVariant === ButtonVariant.UNSTYLED;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={triggerVariant}
          size={triggerSize}
          withWrapper={false}
          className={cn(
            isShellControl
              ? 'gen-shell-control flex items-center gap-1 rounded-md px-2 py-1 text-left'
              : undefined,
            triggerClassName,
          )}
          data-active={open ? 'true' : 'false'}
          ariaLabel="Connect a social channel"
        >
          {!hideIcon ? <Link className="size-3.5 text-foreground/55" /> : null}
          <span
            className={
              isShellControl
                ? 'text-2xs font-medium text-foreground'
                : undefined
            }
          >
            {triggerLabel}
          </span>
          <ChevronDown
            className={cn(
              'size-3 text-foreground/42 transition-transform',
              open && 'rotate-180',
            )}
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align={contentAlign}
        side="bottom"
        sideOffset={10}
        className="w-[20rem] rounded-md p-2"
      >
        <div className="px-2.5 py-2">
          <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-foreground/42">
            Connect a channel
          </p>
          <p className="mt-1 text-xs text-foreground/58">
            Add a publishing destination without leaving your current work.
          </p>
        </div>

        {error ? (
          <AgentErrorMessage
            className="mx-2 mb-2 rounded-lg border-red-400/25 bg-destructive/10 text-xs text-destructive"
            message={error}
          />
        ) : null}

        <div className="max-h-72 space-y-3 overflow-y-auto px-1 pb-1">
          {groups.map((group) => (
            <div key={group.id} className="space-y-1">
              <p className="px-2 text-2xs font-semibold uppercase tracking-[0.16em] text-foreground/42">
                {group.label}
              </p>
              <div className="grid grid-cols-2 gap-1">
                {group.platforms.map((item) => {
                  const connectKey = item.connectId ?? item.platform;
                  const { Icon } = item;

                  return (
                    <Button
                      key={connectKey}
                      variant={ButtonVariant.UNSTYLED}
                      withWrapper={false}
                      onClick={() => void handleConnect(item)}
                      isDisabled={connectingPlatform !== null}
                      isLoading={connectingPlatform === connectKey}
                      className="gen-shell-surface flex w-full items-center rounded-xl px-3 py-2 text-left text-xs font-medium text-foreground transition-colors"
                    >
                      <Icon
                        className={`mr-1.5 size-3.5 ${item.iconClassName}`}
                      />
                      {item.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
