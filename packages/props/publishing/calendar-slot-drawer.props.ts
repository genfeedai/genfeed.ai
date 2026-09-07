import type { ICalendarSlot } from '@genfeedai/contracts/interfaces';

export type CalendarSlotDrawerProps = {
  isPending: boolean;
  onCancel: () => void;
  onClose: () => void;
  onEditCadence?: () => void;
  onGenerate: (brief?: string) => void;
  onSkip: () => void;
  onWrite: () => void;
  slot: ICalendarSlot | null;
};
