import { RouterPriority } from '@genfeedai/enums';

export const AUTO_MODEL_OPTION_VALUE = '__auto_model__';

export const AUTO_PRIORITY_LABELS: Record<RouterPriority, string> = {
  [RouterPriority.BALANCED]: 'Balanced',
  [RouterPriority.QUALITY]: 'Best Quality',
  [RouterPriority.SPEED]: 'Fastest',
  [RouterPriority.COST]: 'Lowest Cost',
};

export const AUTO_PRIORITY_OPTIONS = [
  RouterPriority.QUALITY,
  RouterPriority.BALANCED,
  RouterPriority.SPEED,
  RouterPriority.COST,
];

export function getAutoModelLabel(prioritize: RouterPriority): string {
  return `Auto · ${AUTO_PRIORITY_LABELS[prioritize]}`;
}
