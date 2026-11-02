import { isRecord } from '@genfeedai/utils/data/extract.util';
import type { ProposedValueView } from '@/features/admin/props/concierge.props';

/**
 * A proposed value is a string, or the extracted record behind it: a logo is
 * `{ url, role, label, sourceType }`. People review an image and a label, not
 * the record's JSON.
 */
export function getProposedValueView(value: unknown): ProposedValueView {
  if (typeof value === 'string') {
    return { kind: 'text', text: value };
  }

  if (isRecord(value) && typeof value.url === 'string') {
    return {
      kind: 'image',
      label: typeof value.label === 'string' ? value.label : value.url,
      url: value.url,
    };
  }

  if (Array.isArray(value)) {
    return {
      kind: 'text',
      text: value
        .map((item) =>
          typeof item === 'string' ? item : (JSON.stringify(item) ?? ''),
        )
        .join(', '),
    };
  }

  return { kind: 'text', text: JSON.stringify(value) ?? '' };
}
