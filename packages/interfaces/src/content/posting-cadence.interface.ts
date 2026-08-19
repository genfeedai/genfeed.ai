import type {
  CadenceGenerateLanding,
  CalendarSlotItemType,
  CalendarSlotState,
  PostCategory,
  PostingCadenceStatus,
} from '@genfeedai/enums';
import type { IBaseEntity } from '../core/base.interface';

export interface IPostingCadence extends IBaseEntity {
  brief?: string | null;
  brandId: string;
  credentialId: string;
  endsAt?: string | null;
  format: PostCategory;
  generateLanding: CadenceGenerateLanding;
  intervalMinutes: number;
  label?: string | null;
  maxOccurrences?: number | null;
  organizationId: string;
  startsAt: string;
  status: PostingCadenceStatus;
  timezone: string;
  userId: string;
  windowEndMinute: number;
  windowStartMinute: number;
}

export interface ICalendarSlot {
  brandId: string;
  cadenceId: string | null;
  credentialId: string;
  format: PostCategory;
  generatedItemId?: string | null;
  generatedItemType?: CalendarSlotItemType | null;
  id: string;
  identityKey: string;
  instant: string;
  lastFailureReason?: string | null;
  resolvedBrief: string;
  state: CalendarSlotState;
  timezone: string;
}

export interface ICalendarSlotFillResult {
  releaseId: string;
  slot: ICalendarSlot;
  targetId: string;
}
