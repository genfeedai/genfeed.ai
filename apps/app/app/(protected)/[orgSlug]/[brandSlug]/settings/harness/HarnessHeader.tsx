'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { ICreateHarnessProfilePayload } from '@genfeedai/interfaces';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';

type HarnessHeaderProps = {
  draft: ICreateHarnessProfilePayload;
  isSaving: boolean;
  onSave: () => void;
};

export default function HarnessHeader({
  draft,
  isSaving,
  onSave,
}: HarnessHeaderProps) {
  return (
    <Card className="p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Harness Profile
            </h1>
            <Badge variant="outline">v1.1</Badge>
            <Badge variant={draft.status === 'active' ? 'success' : 'warning'}>
              {draft.status ?? 'active'}
            </Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Structure-first voice rules injected into content generation. Keep
            it concrete: hook, one-liners, transitions, proof, conclusion.
          </p>
        </div>
        <Button
          disabled={isSaving}
          onClick={onSave}
          size={ButtonSize.SM}
          variant={ButtonVariant.DEFAULT}
        >
          {isSaving ? 'Saving...' : 'Save harness'}
        </Button>
      </div>
    </Card>
  );
}
