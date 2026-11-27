import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ConnectClientMarkId } from '@genfeedai/helpers/integrations/connect-genfeed-clients.helper';
import {
  AnthropicIcon,
  MetaIcon,
  OpenAiIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { XaiIcon } from '@genfeedai/helpers/ui/icons/brands/model-provider-icons';
import type { ConnectClientMarksProps } from '@genfeedai/props/ui/feedback/connect-client-marks.props';
import type { ComponentType, SVGProps } from 'react';

interface MarkStyle {
  /** Official marks are drawn on their owner's backing so they read in either theme, as on the MCP setup page. */
  backing: string;
  color: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const MARKS: Record<ConnectClientMarkId, MarkStyle> = {
  claude: { backing: '#ffffff', color: '#d97757', Icon: AnthropicIcon },
  codex: { backing: '#ffffff', color: '#000000', Icon: OpenAiIcon },
  grok: { backing: '#050505', color: '#fcfcfc', Icon: XaiIcon },
  meta: { backing: '#ffffff', color: '#0082fb', Icon: MetaIcon },
};

/** The application marks of a client, as the small tiles the MCP setup page shows on its tabs. */
export default function ConnectClientMarks({
  className,
  marks,
}: ConnectClientMarksProps) {
  if (marks.length === 0) {
    return null;
  }

  return (
    <span aria-hidden="true" className={cn('inline-flex gap-1', className)}>
      {marks.map((mark) => {
        const { backing, color, Icon } = MARKS[mark];
        return (
          <span
            className="inline-grid size-5 place-items-center rounded-[5px]"
            key={mark}
            style={{ backgroundColor: backing, color }}
          >
            <Icon className="size-3.5" />
          </span>
        );
      })}
    </span>
  );
}
