'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { GenerationSetupProvenanceDotProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { Pin } from 'lucide-react';

const SOURCE_LABEL: Record<
  GenerationSetupProvenanceDotProps['source'],
  string
> = {
  agent: 'Set by the agent',
  preset: 'Pinned from a preset',
  user: 'Set by you',
};

/**
 * Provenance indicator for one field: an accent dot for agent-owned fields, a
 * pin for a preset-pinned field, and a neutral dot once the operator has
 * touched it. No `gen-dot-accent` class exists yet, so the agent state
 * composes the shared `gen-dot` size token with `bg-primary` directly.
 */
export default function GenerationSetupProvenanceDot({
  reason,
  source,
}: GenerationSetupProvenanceDotProps) {
  const label = reason ?? SOURCE_LABEL[source];

  const indicator =
    source === 'preset' ? (
      <Pin
        aria-hidden="true"
        className="size-3 shrink-0 text-muted-foreground"
      />
    ) : (
      <span
        aria-hidden="true"
        className={cn(
          'gen-dot',
          source === 'agent' ? 'bg-primary' : 'gen-dot-muted',
        )}
      />
    );

  return (
    <SimpleTooltip label={label} position="top">
      <span
        aria-label={label}
        className="inline-flex items-center justify-center"
        role="img"
      >
        {indicator}
      </span>
    </SimpleTooltip>
  );
}
