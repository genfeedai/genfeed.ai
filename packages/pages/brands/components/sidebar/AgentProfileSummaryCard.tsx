'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
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
    <div className="rounded-md bg-background-secondary/50 px-3 py-2.5">
      <p className="text-2xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm text-foreground/90">{value}</p>
    </div>
  );
}

export default function AgentProfileSummaryCard({
  onManage,
  summaryItems,
}: AgentProfileSummaryCardProps) {
  return (
    <Card
      label="Agent Profile"
      description="Persona, voice, strategy, and platform overrides for agents."
      headerAction={
        <Button
          onClick={onManage}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          className="h-8 shrink-0 px-2.5 text-xs"
        >
          Manage
        </Button>
      }
    >
      <div className="grid gap-2 md:grid-cols-2">
        {summaryItems.map((item) => (
          <SummaryItem key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
    </Card>
  );
}
