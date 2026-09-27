import type { AgentClientCommandBlock } from '@data/agent-clients.data';
import { Code } from '@ui/primitives/code';
import { Pre } from '@ui/primitives/pre';

export default function CommandBlock({
  label,
  value,
}: AgentClientCommandBlock): React.ReactElement {
  return (
    <div className="overflow-hidden rounded-lg bg-card shadow-border-strong">
      <p className="border-b border-edge/5 bg-background/95 px-4 py-2 text-2xs font-bold uppercase tracking-[0.14em] text-surface/45">
        {label}
      </p>
      <Pre className="overflow-x-auto bg-background/80 p-6 text-sm leading-6">
        <Code className="whitespace-pre-wrap bg-transparent text-surface/70 [overflow-wrap:anywhere]">
          {value}
        </Code>
      </Pre>
    </div>
  );
}
