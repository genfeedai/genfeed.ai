'use client';

import Card from '@ui/card/Card';
import { Input } from '@ui/primitives/input';

type CreditGovernanceCardProps = {
  agentDailyCreditCap: string;
  brandDailyCreditCap: string;
  onAgentDailyCreditCapChange: (value: string) => void;
  onBrandDailyCreditCapChange: (value: string) => void;
};

export default function CreditGovernanceCard({
  agentDailyCreditCap,
  brandDailyCreditCap,
  onAgentDailyCreditCapChange,
  onBrandDailyCreditCapChange,
}: CreditGovernanceCardProps) {
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-4">Credit Governance</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label
            htmlFor="brand-daily-credit-cap"
            className="text-sm font-medium"
          >
            Brand Daily Cap
          </label>
          <Input
            id="brand-daily-credit-cap"
            className="mt-2"
            type="number"
            min={0}
            placeholder="Optional"
            value={brandDailyCreditCap}
            onChange={(event) =>
              onBrandDailyCreditCapChange(event.target.value)
            }
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Optional pooled-credit cap applied per brand across all agents.
          </p>
        </div>

        <div>
          <label
            htmlFor="agent-daily-credit-cap"
            className="text-sm font-medium"
          >
            Agent Daily Cap
          </label>
          <Input
            id="agent-daily-credit-cap"
            className="mt-2"
            type="number"
            min={0}
            placeholder="Optional"
            value={agentDailyCreditCap}
            onChange={(event) =>
              onAgentDailyCreditCapChange(event.target.value)
            }
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Hard ceiling enforced per strategy against the org pool.
          </p>
        </div>
      </div>
    </Card>
  );
}
