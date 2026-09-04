import { RouterPriority } from '@genfeedai/contracts';
import type { ModelSelectorFilter } from '@genfeedai/props/ui/model-selector/model-selector.props';
import {
  MODEL_FILTER_ALL,
  MODEL_FILTER_AUDIO,
  MODEL_FILTER_CHEAP,
  MODEL_FILTER_FAST,
  MODEL_FILTER_LEGACY,
} from '@ui/dropdowns/model-selector/model-selector.utils';
import { CircleDollarSign, History, Volume2, Zap } from 'lucide-react';

export const AUTO_MODEL_OPTION_VALUE = '__auto_model__';

/** Legacy Studio localStorage wrote this before `__auto_model__`. */
const LEGACY_AUTO_MODEL_KEY = 'auto';

export function isAutoGenerationModelKey(
  modelKey: string | undefined | null,
): boolean {
  return (
    modelKey == null ||
    modelKey === '' ||
    modelKey === AUTO_MODEL_OPTION_VALUE ||
    modelKey === LEGACY_AUTO_MODEL_KEY
  );
}

/** Generation-setup store sentinel for Auto is an empty string. */
export function toGenerationSetupModelKey(
  modelKey: string | undefined | null,
): string {
  return isAutoGenerationModelKey(modelKey) ? '' : (modelKey ?? '');
}

/** Studio settings persist Auto as `__auto_model__`. */
export function toStudioSettingsModelKey(
  modelKey: string | undefined | null,
): string {
  return isAutoGenerationModelKey(modelKey)
    ? AUTO_MODEL_OPTION_VALUE
    : (modelKey ?? AUTO_MODEL_OPTION_VALUE);
}

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

export const MODEL_FILTER_ALL_OPTION: ModelSelectorFilter = {
  id: MODEL_FILTER_ALL,
  label: 'All',
};

export const MODEL_CATEGORY_AUTO = 'category:auto';
export const MODEL_CATEGORY_CATALOG = 'category:catalog';

export const MODEL_CATEGORY_AUTO_OPTION: ModelSelectorFilter = {
  id: MODEL_CATEGORY_AUTO,
  label: 'Auto',
};

export const MODEL_CATEGORY_CATALOG_OPTION: ModelSelectorFilter = {
  id: MODEL_CATEGORY_CATALOG,
  label: 'Catalog',
};

/**
 * Capability shortcuts. Each one only joins the pill row when the current
 * catalog actually has a model behind it — an empty filter is a dead control.
 */
export const MODEL_CAPABILITY_FILTERS: ModelSelectorFilter[] = [
  { icon: Zap, id: MODEL_FILTER_FAST, label: 'Fast' },
  { icon: Volume2, id: MODEL_FILTER_AUDIO, label: 'Audio' },
  { icon: CircleDollarSign, id: MODEL_FILTER_CHEAP, label: 'Cheapest' },
];

export const MODEL_LEGACY_FILTER: ModelSelectorFilter = {
  icon: History,
  id: MODEL_FILTER_LEGACY,
  label: 'Legacy',
};
