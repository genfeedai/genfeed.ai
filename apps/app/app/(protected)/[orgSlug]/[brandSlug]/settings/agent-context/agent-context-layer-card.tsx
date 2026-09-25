'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AgentContextLayerCardProps } from '@props/settings/agent-context.props';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/** Layers whose gaps the brand interview fills. */
const INTERVIEW_LAYERS = new Set(['persona', 'prompting', 'strategy', 'voice']);

/**
 * One context layer: what the agent sees, whether it reaches the prompt, and
 * where to edit it. An empty layer renders a nudge instead of its body.
 */
export default function AgentContextLayerCard({
  children,
  editHrefs,
  id,
  layerKey,
  status,
}: AgentContextLayerCardProps) {
  const translate = useTranslations('pages.brandAgentContext');
  const editTarget = status?.editTarget ?? 'profile';
  const isEmpty = status?.isEmpty ?? true;
  const isInjected = status?.isInjected ?? false;
  const statusLabel = isEmpty
    ? translate('status.empty')
    : isInjected
      ? translate('status.injected')
      : translate('status.storedOnly');
  const statusVariant = isEmpty
    ? 'secondary'
    : isInjected
      ? 'success'
      : 'warning';

  return (
    <Card
      data-testid={`agent-context-layer-${layerKey}`}
      headerAction={
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={statusVariant}>{statusLabel}</Badge>
          <Button
            asChild
            size={ButtonSize.XS}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            <Link href={editHrefs[editTarget]}>
              {translate(`edit.${editTarget}`)}
            </Link>
          </Button>
        </div>
      }
      id={id}
      label={translate(`layers.${layerKey}`)}
    >
      {isEmpty ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {translate(`empty.${layerKey}`)}
          </p>
          {INTERVIEW_LAYERS.has(layerKey) ? (
            <Button
              asChild
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            >
              <Link href={editHrefs.interview}>
                {translate('edit.interview')}
              </Link>
            </Button>
          ) : null}
        </div>
      ) : (
        children
      )}
    </Card>
  );
}
