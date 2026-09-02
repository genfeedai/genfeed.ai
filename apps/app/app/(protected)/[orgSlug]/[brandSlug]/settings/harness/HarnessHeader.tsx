'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { ICreateHarnessProfilePayload } from '@genfeedai/contracts/interfaces';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';

type HarnessHeaderProps = {
  draft: ICreateHarnessProfilePayload;
  isPromoting?: boolean;
  isSaving: boolean;
  onPromoteWinners?: () => void;
  onSave: () => void;
};

export default function HarnessHeader({
  draft,
  isPromoting = false,
  isSaving,
  onPromoteWinners,
  onSave,
}: HarnessHeaderProps) {
  return (
    <Card
      label="Brand harness"
      description="This brand’s agent runtime profile — structure, delivery knobs, and examples. Scoped to the brand (not org-wide)."
      bodyClassName="gap-3 p-4"
      headerAction={
        <div className="flex flex-wrap gap-2">
          {onPromoteWinners ? (
            <Button
              disabled={isPromoting || isSaving}
              onClick={onPromoteWinners}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            >
              {isPromoting ? 'Promoting…' : 'Promote winners to memory'}
            </Button>
          ) : null}
          <Button
            disabled={isSaving}
            onClick={onSave}
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
          >
            {isSaving ? 'Saving...' : 'Save harness'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">v1.1</Badge>
        <Badge variant={draft.status === 'active' ? 'success' : 'warning'}>
          {draft.status ?? 'active'}
        </Badge>
        <Badge variant="outline">scope: {draft.scope ?? 'brand'}</Badge>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Writing brand voice (tone pillars) lives under Brand voice. Harness owns
        how drafts are shaped and delivered once that voice is set.
      </p>
    </Card>
  );
}
