import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { CLIENT_LOGO_SVGS } from '@genfeedai/helpers/integrations/connect-client-logos.helper';
import type { ConnectClientMarkId } from '@genfeedai/helpers/integrations/connect-genfeed-clients.helper';
import type { ConnectClientMarksProps } from '@genfeedai/props/ui/feedback/connect-client-marks.props';
import Image from 'next/image';

/** Official marks sit on their owner's backing so they read in either theme. */
const BACKINGS: Record<ConnectClientMarkId, string> = {
  claude: '#ffffff',
  codex: '#ffffff',
  grok: '#050505',
  meta: '#ffffff',
};

const MARK_SOURCES = Object.fromEntries(
  Object.entries(CLIENT_LOGO_SVGS).map(([mark, svg]) => [
    mark,
    `data:image/svg+xml,${encodeURIComponent(svg)}`,
  ]),
) as Record<ConnectClientMarkId, string>;

/** The application marks of a client, the same tiles the MCP setup page shows on its tabs. */
export default function ConnectClientMarks({
  className,
  marks,
}: ConnectClientMarksProps) {
  if (marks.length === 0) {
    return null;
  }

  return (
    <span aria-hidden="true" className={cn('inline-flex gap-1', className)}>
      {marks.map((mark) => (
        <span
          className="inline-grid size-5 place-items-center rounded-[5px]"
          key={mark}
          style={{ backgroundColor: BACKINGS[mark], colorScheme: 'light' }}
        >
          <Image
            unoptimized
            alt=""
            className="size-3.5"
            height={14}
            src={MARK_SOURCES[mark]}
            width={14}
          />
        </span>
      ))}
    </span>
  );
}
