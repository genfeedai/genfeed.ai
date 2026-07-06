'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';

type SummaryItemData = {
  label: string;
  value: string;
};

type AgentProfileSummaryCardProps = {
  onManage: () => void;
  summaryItems: SummaryItemData[];
};

function SummaryItem({ label, value }: SummaryItemData) {
  return (
    <div className="rounded-lg bg-background-secondary p-3 shadow-border">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm text-foreground/90">{value}</p>
    </div>
  );
}

export default function AgentProfileSummaryCard({
  onManage,
  summaryItems,
}: AgentProfileSummaryCardProps) {
  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Agent Profile</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Set the brand-level persona, voice, strategy, and platform
              overrides used by autonomous agents and content runs.
            </p>
          </div>

          <Button
            onClick={onManage}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          >
            Manage
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {summaryItems.map((item) => (
            <SummaryItem
              key={item.label}
              label={item.label}
              value={item.value}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
