import { ButtonSize } from '@genfeedai/contracts';
import type { AgentClientVisualProps } from '@props/agent-client.props';
import { Button } from '@ui/primitives/button';
import { ArrowDownToLine } from 'lucide-react';

export default function AgentClientInstallAction({
  client,
}: AgentClientVisualProps): React.ReactElement {
  return (
    <Button asChild size={ButtonSize.PUBLIC}>
      <a
        href={
          client.slug === 'cursor'
            ? client.installation.destination
            : '#connect'
        }
      >
        <ArrowDownToLine aria-hidden className="mr-2 size-4" />
        {client.installation.label}
      </a>
    </Button>
  );
}
