import { formatShortDate } from '@genfeedai/helpers/formatting/date/short-date.helper';

export function formatInstant(value: string): string {
  return formatShortDate(value) || value;
}
