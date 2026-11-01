import Card from '@ui/card/Card';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import type { CreditGovernanceCardProps } from '@/features/settings/props/policy.props';

export default function CreditGovernanceCard({
  agentDailyCreditCap,
  brandDailyCreditCap,
  onAgentDailyCreditCapChange,
  onBrandDailyCreditCapChange,
}: CreditGovernanceCardProps) {
  return (
    <Card label="Credit Governance">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label htmlFor="brand-daily-credit-cap">Brand Daily Cap</Label>
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
          <Label htmlFor="agent-daily-credit-cap">Agent Daily Cap</Label>
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
