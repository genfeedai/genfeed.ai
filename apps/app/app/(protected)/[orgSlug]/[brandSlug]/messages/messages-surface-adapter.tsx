'use client';

import { useAgentChatStore } from '@genfeedai/agent';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type {
  SocialConversation,
  SocialInboxReference,
} from '@genfeedai/interfaces';
import { Button } from '@ui/primitives/button';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useMemo } from 'react';
import { HiOutlineLink, HiOutlineShieldCheck } from 'react-icons/hi2';
import { useWorkspaceSurfaceAdapter } from '@/components/workspace-shell/WorkspaceSurfaceAdapterContext';
import { getSocialInboxReferenceKey } from './messages-surface.helpers';

interface MessagesSurfaceAdapterParams {
  readonly canAttachReferences: boolean;
  readonly isConversationReferenced: boolean;
  readonly onToggleConversationReference: () => void;
  readonly references: readonly SocialInboxReference[];
  readonly selectedConversation: SocialConversation | null;
}

type MessagesSurfaceInspectorProps = MessagesSurfaceAdapterParams;

function MessagesSurfaceInspector({
  canAttachReferences,
  isConversationReferenced,
  onToggleConversationReference,
  references,
  selectedConversation,
}: MessagesSurfaceInspectorProps) {
  return (
    <div className="space-y-4" data-testid="messages-surface-inspector">
      <div className="rounded-lg border border-border bg-background p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <HiOutlineShieldCheck aria-hidden="true" className="size-4" />
          Social inbox context
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Social conversations stay in Messages. Agent threads receive only the
          typed selectors you attach here, never message bodies, identities, or
          credentials.
        </p>
      </div>

      {selectedConversation ? (
        <div className="space-y-3 rounded-lg border border-border bg-background p-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Selected conversation
            </p>
            <p className="mt-1 truncate text-sm text-foreground">
              {selectedConversation.participantName ||
                selectedConversation.participantHandle ||
                'Authorized social participant'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedConversation.platform} · {selectedConversation.status}
            </p>
          </div>
          <Button
            icon={<HiOutlineLink className="size-4" />}
            isDisabled={!canAttachReferences}
            onClick={onToggleConversationReference}
            size={ButtonSize.SM}
            variant={
              isConversationReferenced
                ? ButtonVariant.OUTLINE
                : ButtonVariant.DEFAULT
            }
            withWrapper={false}
          >
            {isConversationReferenced
              ? 'Remove conversation reference'
              : 'Attach conversation reference'}
          </Button>
          {!canAttachReferences ? (
            <p className="text-xs leading-5 text-warning" role="status">
              Select an agent thread scoped to this brand before attaching
              social references.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-background p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Agent context references
        </p>
        {references.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {references.map((reference) => (
              <li
                className="truncate rounded bg-background-secondary px-2 py-1.5 font-mono text-[11px] text-foreground/75"
                key={getSocialInboxReferenceKey(reference)}
              >
                {reference.kind === 'social-message'
                  ? `${reference.kind}:${reference.messageId}`
                  : `${reference.kind}:${reference.conversationId}`}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            No social records are attached to the agent composer.
          </p>
        )}
      </div>
    </div>
  );
}

export function useMessagesSurfaceAdapter({
  canAttachReferences,
  isConversationReferenced,
  onToggleConversationReference,
  references,
  selectedConversation,
}: MessagesSurfaceAdapterParams): void {
  const pathname = usePathname();
  const setPageContext = useAgentChatStore((state) => state.setPageContext);
  const inspector: ReactNode = useMemo(
    () => (
      <MessagesSurfaceInspector
        canAttachReferences={canAttachReferences}
        isConversationReferenced={isConversationReferenced}
        onToggleConversationReference={onToggleConversationReference}
        references={references}
        selectedConversation={selectedConversation}
      />
    ),
    [
      canAttachReferences,
      isConversationReferenced,
      onToggleConversationReference,
      references,
      selectedConversation,
    ],
  );
  const adapter = useMemo(
    () => ({
      contextLabel:
        references.length > 0
          ? `Canvas · Messages · ${references.length} social ${references.length === 1 ? 'reference' : 'references'}`
          : 'Canvas · Messages',
      inspector,
      surfaceKey: 'messages',
    }),
    [inspector, references.length],
  );

  useWorkspaceSurfaceAdapter(adapter);

  useEffect(() => {
    const current = useAgentChatStore.getState().pageContext;
    setPageContext({
      ...current,
      placeholder: 'Ask for help with the selected social conversation...',
      route: pathname,
      socialReferences: references.length > 0 ? [...references] : undefined,
      suggestedActions: current?.suggestedActions ?? [],
    });

    return () => {
      const latest = useAgentChatStore.getState().pageContext;
      if (latest?.route !== pathname) {
        return;
      }

      setPageContext({
        ...latest,
        socialReferences: undefined,
      });
    };
  }, [pathname, references, setPageContext]);
}
