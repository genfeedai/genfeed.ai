import type { AgentClientLogoProps } from '@props/agent-client.props';
import Image from 'next/image';

export default function AgentClientLogo({ client }: AgentClientLogoProps) {
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-md bg-white [color-scheme:light]"
    >
      <Image
        alt=""
        className="size-8 object-contain"
        height={32}
        src={client.logo}
        unoptimized
        width={32}
      />
    </span>
  );
}
