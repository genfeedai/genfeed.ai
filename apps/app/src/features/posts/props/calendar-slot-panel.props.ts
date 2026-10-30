import type { ICalendarSlot } from '@genfeedai/contracts/interfaces';

export type CalendarSlotPanelProps = {
  isPending: boolean;
  onCancel: () => void;
  onClose: () => void;
  onEditCadence?: () => void;
  onGenerate: (brief?: string) => void;
  onSkip: () => void;
  onWrite: () => void;
  slot: ICalendarSlot | null;
};

export type CalendarSlotBodyProps = Omit<
  CalendarSlotPanelProps,
  'onClose' | 'slot'
> & {
  slot: ICalendarSlot;
};
