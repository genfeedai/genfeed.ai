'use client';

import type { AgentRuntimeOption } from '@genfeedai/agent/models/agent-runtime.model';
import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { buildDesktopThreadLink } from '@genfeedai/contracts/desktop';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import { Monitor, Server } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactElement, useMemo } from 'react';

interface AgentWebLocalCliNoticeProps {
  /** The local CLI runtime the thread is bound to. */
  runtime: AgentRuntimeOption;
  /** Null for a draft: there is no thread to open in Desktop yet. */
  threadId: string | null;
  onSwitchToHosted: () => void;
}

function resolveDesktopThreadLink(threadId: string | null): string | null {
  if (!threadId) {
    return null;
  }

  try {
    return buildDesktopThreadLink(threadId);
  } catch {
    return null;
  }
}

/**
 * Composer banner for a thread bound to a local Claude Code / Codex CLI when
 * the plain web app is open. A browser cannot run the CLI, so sends are
 * blocked (the draft stays); the user either moves the thread to the
 * credit-billed hosted runtime or continues it in Genfeed Desktop.
 */
export function AgentWebLocalCliNotice({
  onSwitchToHosted,
  runtime,
  threadId,
}: AgentWebLocalCliNoticeProps): ReactElement {
  const translate = useTranslations('agent.localCliRuntime');
  const desktopLink = useMemo(
    () => resolveDesktopThreadLink(threadId),
    [threadId],
  );

  return (
    <Alert
      className="w-full"
      icon={<Monitor className="size-4" />}
      type={AlertCategory.WARNING}
    >
      <div
        className="flex min-w-0 flex-col gap-2"
        data-testid="agent-web-local-cli-notice"
      >
        <p className="text-sm font-medium">
          {translate('title', { runtime: runtime.label })}
        </p>
        <p className="text-xs">
          {translate('notice', { runtime: runtime.label })}{' '}
          {translate('creditsNote', { runtime: runtime.label })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            icon={<Server className="size-4" />}
            label={translate('switchToHosted')}
            onClick={onSwitchToHosted}
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
          />
          {desktopLink ? (
            <Button
              asChild
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            >
              <a href={desktopLink}>
                <Monitor className="size-4" />
                {translate('openInDesktop')}
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </Alert>
  );
}
