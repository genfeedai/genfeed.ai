import type {
  IIngredient,
  IngredientTimeGroup,
} from '@genfeedai/contracts/interfaces';
import {
  format,
  isThisMonth,
  isThisWeek,
  isToday,
  isYesterday,
} from 'date-fns';

function toTimestamp(ingredient: IIngredient): number {
  const createdAt = ingredient.createdAt;

  if (!createdAt) {
    return Number.NaN;
  }

  return new Date(createdAt).getTime();
}

/**
 * Contact-sheet headers only make sense when the rows below them are ordered by
 * time. Rather than thread the active sort down three component layers, we read
 * it off the data: a newest-first list is monotonically non-increasing, and any
 * other sort (name, size, provider) breaks that almost immediately.
 */
export function getIsChronologicalDescending(items: IIngredient[]): boolean {
  let previous = Number.POSITIVE_INFINITY;

  for (const item of items) {
    const timestamp = toTimestamp(item);

    if (Number.isNaN(timestamp) || timestamp > previous) {
      return false;
    }

    previous = timestamp;
  }

  return true;
}

function getTimeGroupLabel(timestamp: number): string {
  const date = new Date(timestamp);

  if (isToday(date)) {
    return 'Today';
  }

  if (isYesterday(date)) {
    return 'Yesterday';
  }

  if (isThisWeek(date)) {
    return 'This week';
  }

  if (isThisMonth(date)) {
    return 'This month';
  }

  return format(date, 'MMMM yyyy');
}

/**
 * Splits a newest-first list into the buckets a person actually thinks in.
 * Returns `null` when the list is not in chronological order, so the caller
 * renders one flat grid instead of headers that would lie about the sort.
 */
export function groupIngredientsByTime(
  items: IIngredient[],
): IngredientTimeGroup[] | null {
  if (!getIsChronologicalDescending(items)) {
    return null;
  }

  const groups: IngredientTimeGroup[] = [];

  for (const item of items) {
    const label = getTimeGroupLabel(toTimestamp(item));
    const currentGroup = groups.at(-1);

    if (currentGroup?.label === label) {
      currentGroup.items.push(item);
      continue;
    }

    groups.push({ items: [item], label });
  }

  return groups;
}
