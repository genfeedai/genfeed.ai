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
    <Card
      label="Harness Profile"
      bodyClassName="gap-3 p-4"
      headerAction={
        <Button
          disabled={isSaving}
          onClick={onSave}
          size={ButtonSize.SM}
          variant={ButtonVariant.DEFAULT}
        >
          {isSaving ? 'Saving...' : 'Save harness'}
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">v1.1</Badge>
        <Badge variant={draft.status === 'active' ? 'success' : 'warning'}>
          {draft.status ?? 'active'}
        </Badge>
      </div>
    </Card>
  );
}
