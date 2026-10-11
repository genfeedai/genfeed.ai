import type {
  IBrandRelocationHeldSchedule,
  IBrandRelocationMovingResource,
  IBrandRelocationSharedPersona,
  IBrandRelocationSummary,
} from '@genfeedai/services/social/brand-relocation.types';

const MAX_LISTED_ITEMS = 5;

function joinRelocationSummaryItems(items: string[]): string {
  if (items.length === 0) {
    return '';
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export function buildMovingResourcesSummary(
  resources: readonly IBrandRelocationMovingResource[] | undefined,
): string | null {
  const items = (resources ?? [])
    .filter((resource) => resource.count > 0)
    .map((resource) => `${resource.count} ${resource.label}`);

  if (items.length === 0) {
    return null;
  }

  return `Also moving with it: ${joinRelocationSummaryItems(items)}.`;
}

function describeHeldSchedule(schedule: IBrandRelocationHeldSchedule): string {
  const name = schedule.label?.trim() || 'Untitled workflow';
  const zone = schedule.timezone ? ` ${schedule.timezone}` : '';
  return `${name} (${schedule.schedule}${zone})`;
}

/**
 * The relocation warning for schedules the move pauses: the cron expression and
 * timezone stay, but whoever saved a schedule is not carried to the new
 * organization, so someone there saves it again to resume it.
 */
export function buildHeldSchedulesSummary(
  schedules: readonly IBrandRelocationHeldSchedule[] | undefined,
): string | null {
  if (!schedules || schedules.length === 0) {
    return null;
  }

  const listed = schedules.slice(0, MAX_LISTED_ITEMS).map(describeHeldSchedule);
  const remaining = schedules.length - listed.length;
  const names = joinRelocationSummaryItems(
    remaining > 0 ? [...listed, `${remaining} more`] : listed,
  );
  const noun = schedules.length === 1 ? 'schedule' : 'schedules';
  const pronoun = schedules.length === 1 ? 'it' : 'them';

  return `${schedules.length} ${noun} will pause until someone saves ${pronoun} again in the new organization: ${names}.`;
}

function describeSharedPersona(persona: IBrandRelocationSharedPersona): string {
  return persona.label.trim() || persona.handle || 'Untitled character';
}

/**
 * The relocation warning for characters the brand shares beyond itself: the
 * sharing was decided in the organization it leaves, so the move limits each
 * one to this brand and clears its brand list.
 */
export function buildSharedPersonasSummary(
  personas: readonly IBrandRelocationSharedPersona[] | undefined,
): string | null {
  if (!personas || personas.length === 0) {
    return null;
  }

  const listed = personas.slice(0, MAX_LISTED_ITEMS).map(describeSharedPersona);
  const remaining = personas.length - listed.length;
  const names = joinRelocationSummaryItems(
    remaining > 0 ? [...listed, `${remaining} more`] : listed,
  );
  const noun = personas.length === 1 ? 'character is' : 'characters are';

  return `${personas.length} shared ${noun} limited to this brand only after the move: ${names}.`;
}

/** The toast shown once a move has committed, from the server's summary. */
export function buildRelocationToastMessage(
  summary: IBrandRelocationSummary,
): string {
  const parts: string[] = [];
  if (summary.workflowsMoved > 0) {
    parts.push(`${summary.workflowsMoved} moved`);
  }
  if (summary.schedulesHeld > 0) {
    parts.push(
      `${summary.schedulesHeld} ${summary.schedulesHeld === 1 ? 'schedule' : 'schedules'} paused until saved again`,
    );
  }
  if (summary.personasSharingReset > 0) {
    parts.push(
      `${summary.personasSharingReset} shared ${summary.personasSharingReset === 1 ? 'character' : 'characters'} limited to this brand only`,
    );
  }
  if (summary.personaGrantsRevoked > 0) {
    parts.push(
      `${summary.personaGrantsRevoked} character ${summary.personaGrantsRevoked === 1 ? 'grant' : 'grants'} revoked`,
    );
  }

  const detail = parts.length > 0 ? ` — ${parts.join(', ')}` : '';
  const pendingNote =
    summary.schedulingPending > 0
      ? ' Some queued schedule jobs could not be cleared; they stop on their next run.'
      : '';

  return `Moved to destination organization${detail}.${pendingNote}`;
}
