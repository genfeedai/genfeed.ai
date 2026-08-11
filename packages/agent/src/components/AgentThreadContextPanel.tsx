'use client';

import { formatRelativeTime } from '@genfeedai/agent/components/agent-thread-list.helpers';
import type { AgentSetupConnection } from '@genfeedai/agent/components/useAgentSetupStatus';
import {
  CONVERSATION_COMPOSER_ACTIONS,
  resolveConversationComposerDestinationHref,
} from '@genfeedai/agent/constants/conversation-composer-actions.constant';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { APP_ROUTES } from '@genfeedai/constants';
import { ComponentSize } from '@genfeedai/enums';
import type { Brand } from '@genfeedai/models/organization/brand.model';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Card from '@ui/card/Card';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';

interface AgentThreadContextPanelProps {
  brand: Brand | undefined;
  className?: string;
  completenessScore: number | null;
  connectedConnections: AgentSetupConnection[];
  threadId?: string;
}

function getConnectionLabel(connection: AgentSetupConnection): string {
  return (
    connection.name ||
    connection.label ||
    (connection.handle ? `@${connection.handle.replace(/^@/, '')}` : '') ||
    connection.platform
  );
}

function ContextSection({
  action,
  children,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  title: string;
}): ReactElement {
  return (
    <Card bodyClassName="gap-0 p-3 sm:p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-foreground/60">
          {title}
        </span>
        {action}
      </div>
      {children}
    </Card>
  );
}

function ContextRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="shrink-0 text-[11px] text-foreground/45">{label}</span>
      <span className="min-w-0 truncate text-right text-xs font-medium text-foreground/85">
        {value}
      </span>
    </div>
  );
}

function SectionLink({
  href,
  label,
}: {
  href: string;
  label: string;
}): ReactElement {
  return (
    <Link
      href={href}
      className="shrink-0 text-[11px] font-medium text-foreground/45 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      {label}
    </Link>
  );
}

/**
 * The Context rail's always-available body on `/agent/*`.
 *
 * The rail previously had exactly two occupants — thread outputs and the setup
 * panel — so a conversation with neither (setup finished, or no brand selected
 * at all on an org-level `~` route) rendered a placeholder sentence and nothing
 * else. The thread always has context worth showing: which brand it is bound
 * to, which channels it can publish to, and what the conversation itself is.
 * Every section links to the page that owns it, so the rail is navigable rather
 * than decorative.
 */
export function AgentThreadContextPanel({
  brand,
  className,
  completenessScore,
  connectedConnections,
  threadId,
}: AgentThreadContextPanelProps): ReactElement {
  const { activeHref, brandSlug, orgHref } = useOrgUrl();
  const thread = useAgentChatStore((s) =>
    threadId ? (s.threads.find((item) => item.id === threadId) ?? null) : null,
  );
  const messageCount = useAgentChatStore((s) => s.messages.length);

  const resolveDestination = (route: string): string =>
    resolveConversationComposerDestinationHref({
      activeHref,
      orgHref,
      route,
      routeBrandSlug: brandSlug,
      selectedBrandSlug: brand?.slug,
    });

  const startedAt = formatRelativeTime(thread?.createdAt);
  const lastActivityAt = formatRelativeTime(
    thread?.lastActivityAt ?? thread?.updatedAt,
  );

  return (
    <section
      className={cn('flex h-full min-h-0 w-full flex-col', className)}
      data-testid="agent-thread-context-panel"
    >
      <div className="gen-shell-toolbar shrink-0 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/35">
          Context
        </p>
        <h2 className="mt-1 truncate text-base font-semibold text-foreground">
          {thread?.title?.trim() || 'This conversation'}
        </h2>
        <p className="mt-1 text-xs leading-5 text-foreground/55">
          What the agent is working with right now.
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <ContextSection
          action={
            <SectionLink
              href={orgHref(APP_ROUTES.SETTINGS.BRANDS)}
              label={brand ? 'Manage' : 'Set up'}
            />
          }
          title="Brand"
        >
          {brand ? (
            <>
              <ContextRow label="Active" value={brand.label || 'Untitled'} />
              {completenessScore !== null ? (
                <ContextRow
                  label="Context filled"
                  value={`${completenessScore}%`}
                />
              ) : null}
            </>
          ) : (
            <p className="text-[11px] leading-5 text-muted-foreground">
              No brand selected. The agent writes generically until one is
              chosen.
            </p>
          )}
        </ContextSection>

        <ContextSection
          action={
            <SectionLink
              href={orgHref(APP_ROUTES.SETTINGS.SOCIAL)}
              label={connectedConnections.length > 0 ? 'Manage' : 'Connect'}
            />
          }
          title="Channels"
        >
          {connectedConnections.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {connectedConnections.map((connection) => (
                <div
                  className="flex min-w-0 items-center gap-2"
                  key={connection.credentialId}
                >
                  <PlatformBadge
                    platform={connection.platform}
                    showLabel={false}
                    size={ComponentSize.SM}
                  />
                  <span className="min-w-0 truncate text-xs text-foreground/85">
                    {getConnectionLabel(connection)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] leading-5 text-muted-foreground">
              No channels connected. Publishing stays unavailable until one is.
            </p>
          )}
        </ContextSection>

        <ContextSection title="Conversation">
          <ContextRow
            label="Messages"
            value={String(thread?.messageCount ?? messageCount)}
          />
          {thread?.requestedModel ? (
            <ContextRow label="Model" value={thread.requestedModel} />
          ) : null}
          {startedAt ? (
            <ContextRow label="Started" value={`${startedAt} ago`} />
          ) : null}
          {lastActivityAt ? (
            <ContextRow label="Last activity" value={`${lastActivityAt} ago`} />
          ) : null}
        </ContextSection>

        <ContextSection title="Go to">
          <div className="flex flex-wrap gap-1.5">
            {CONVERSATION_COMPOSER_ACTIONS.map((action) => (
              <Link
                key={action.name}
                href={resolveDestination(action.route)}
                title={action.description}
                className="gen-shell-control inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-medium text-foreground/75 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                {action.label}
              </Link>
            ))}
          </div>
        </ContextSection>
      </div>
    </section>
  );
}
