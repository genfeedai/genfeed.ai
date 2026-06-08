import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import { HiOutlineBolt } from 'react-icons/hi2';

type MissionControlBulkBarProps = {
  selectedCount: number;
  onAskAgent: () => void;
};

export function MissionControlBulkBar({
  selectedCount,
  onAskAgent,
}: MissionControlBulkBarProps): ReactElement {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/8 p-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-sm font-medium text-foreground">
          {selectedCount} rows selected for comparison
        </p>
        <p className="mt-1 text-sm text-foreground/65">
          Use the same selected scope in either surface and see whether the
          reasoning still feels comfortable in the narrow rail.
        </p>
      </div>
      <Button variant={ButtonVariant.DEFAULT} onClick={onAskAgent}>
        <span className="inline-flex items-center gap-2">
          <HiOutlineBolt className="size-4" />
          Ask Agent About Selected Rows
        </span>
      </Button>
    </div>
  );
}
