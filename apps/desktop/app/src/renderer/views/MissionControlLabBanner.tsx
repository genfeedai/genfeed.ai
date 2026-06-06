import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import {
  HiOutlineChatBubbleBottomCenterText,
  HiOutlineRectangleStack,
  HiOutlineTableCells,
} from 'react-icons/hi2';
import type { AgentLabMode } from './MissionControlView';

type MissionControlLabBannerProps = {
  mode: AgentLabMode;
  onModeChange: (mode: AgentLabMode) => void;
  onAskAboutTable: () => void;
};

export function MissionControlLabBanner({
  mode,
  onModeChange,
  onAskAboutTable,
}: MissionControlLabBannerProps): ReactElement {
  return (
    <div className="rounded-2xl border border-primary/15 bg-primary/5 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">
            Internal Prototype
          </p>
          <h2 className="mt-2 text-xl font-semibold text-foreground">
            Test the conversation surface without leaving the SaaS UI
          </h2>
          <p className="mt-2 text-sm text-foreground/65">
            The table, filters, and row selection persist while you switch
            between a narrow right rail and a wider overlay sheet. The agent
            conversation is seeded locally so the UX comparison stays
            deterministic.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={
              mode === 'rail' ? ButtonVariant.DEFAULT : ButtonVariant.SECONDARY
            }
            onClick={() => onModeChange('rail')}
          >
            <span className="inline-flex items-center gap-2">
              <HiOutlineRectangleStack className="size-4" />
              Right Rail
            </span>
          </Button>
          <Button
            variant={
              mode === 'overlay'
                ? ButtonVariant.DEFAULT
                : ButtonVariant.SECONDARY
            }
            onClick={() => onModeChange('overlay')}
          >
            <span className="inline-flex items-center gap-2">
              <HiOutlineTableCells className="size-4" />
              Overlay Sheet
            </span>
          </Button>
          <Button variant={ButtonVariant.SECONDARY} onClick={onAskAboutTable}>
            <span className="inline-flex items-center gap-2">
              <HiOutlineChatBubbleBottomCenterText className="size-4" />
              Ask About This Table
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
