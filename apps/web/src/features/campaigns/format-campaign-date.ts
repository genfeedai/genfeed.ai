import { DATE_FORMATS, formatDate } from '@helpers/formatting/date/date.helper';

export function formatCampaignDate(value?: string | null): string {
  if (!value) {
    return '—';
  }
  return formatDate(value, DATE_FORMATS.DISPLAY_DATE) || '—';
}
