import { cn } from '@genfeedai/helpers';
import type { AgentClientLogoProps } from '@props/agent-client.props';
import Image from 'next/image';

export default function AgentClientLogo({
  client,
  className,
}: AgentClientLogoProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-8 shrink-0 items-center justify-center',
        className,
      )}
    >
      <Image
        alt=""
        className="size-full object-contain"
        height={32}
        src={client.logo}
        unoptimized
        width={32}
      />
    </span>
  );
}
