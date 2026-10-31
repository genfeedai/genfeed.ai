import { describe, expect, it } from 'vitest';
import {
  buildHeldSchedulesSummary,
  buildMovingResourcesSummary,
  buildRelocationToastMessage,
  buildSharedPersonasSummary,
} from './brand-relocation-summary.util';

describe('buildMovingResourcesSummary', () => {
  it('summarizes every moving resource in the relocation warning', () => {
    expect(
      buildMovingResourcesSummary([
        { count: 2, label: 'workflows', resource: 'workflow' },
        { count: 5, label: 'posts', resource: 'post' },
        {
          count: 1,
          label: 'workflow execution',
          resource: 'workflowExecution',
        },
      ]),
    ).toBe(
      'Also moving with it: 2 workflows, 5 posts, and 1 workflow execution.',
    );
  });

  it('omits the sentence when no resources move', () => {
    expect(
      buildMovingResourcesSummary([
        { count: 0, label: 'posts', resource: 'post' },
      ]),
    ).toBeNull();
  });
});

describe('buildHeldSchedulesSummary', () => {
  it('lists the schedules the move pauses and says how to resume them', () => {
    expect(
      buildHeldSchedulesSummary([
        {
          id: 'wf_1',
          label: 'Daily post',
          schedule: '0 9 * * *',
          timezone: 'Europe/Berlin',
        },
        { id: 'wf_2', label: null, schedule: '0 18 * * 1', timezone: null },
      ]),
    ).toBe(
      '2 schedules will pause until someone saves them again in the new organization: Daily post (0 9 * * * Europe/Berlin) and Untitled workflow (0 18 * * 1).',
    );
  });

  it('uses singular wording and caps a long list', () => {
    expect(
      buildHeldSchedulesSummary([
        { id: 'wf_1', label: 'One', schedule: '* * * * *', timezone: null },
      ]),
    ).toContain('1 schedule will pause until someone saves it again');

    const many = Array.from({ length: 7 }, (_, index) => ({
      id: `wf_${index}`,
      label: `Flow ${index}`,
      schedule: '* * * * *',
      timezone: null,
    }));
    expect(buildHeldSchedulesSummary(many)).toContain('and 2 more.');
  });

  it('is absent when nothing is scheduled', () => {
    expect(buildHeldSchedulesSummary([])).toBeNull();
    expect(buildHeldSchedulesSummary(undefined)).toBeNull();
  });
});

describe('buildSharedPersonasSummary', () => {
  const persona = (index: number, availabilityMode = 'ALL_BRANDS') => ({
    availabilityMode,
    availableBrandCount: 0,
    handle: `char-${index}`,
    id: `persona_${index}`,
    label: `Character ${index}`,
  });

  it('lists the shared characters the move limits to this brand', () => {
    expect(buildSharedPersonasSummary([persona(1)])).toBe(
      '1 shared character is limited to this brand only after the move: Character 1.',
    );
    expect(
      buildSharedPersonasSummary([persona(1), persona(2, 'SELECTED_BRANDS')]),
    ).toBe(
      '2 shared characters are limited to this brand only after the move: Character 1 and Character 2.',
    );
  });

  it('caps the listed names and falls back to the handle for a blank label', () => {
    const many = Array.from({ length: 7 }, (_, index) => persona(index));
    expect(buildSharedPersonasSummary(many)).toContain('and 2 more.');
    expect(
      buildSharedPersonasSummary([{ ...persona(1), label: ' ' }]),
    ).toContain('char-1');
  });

  it('is absent when no character is shared', () => {
    expect(buildSharedPersonasSummary([])).toBeNull();
    expect(buildSharedPersonasSummary(undefined)).toBeNull();
  });
});

describe('buildRelocationToastMessage', () => {
  it('reports the real counts from the server summary', () => {
    expect(
      buildRelocationToastMessage({
        membersSevered: 0,
        personaGrantsRevoked: 1,
        personasSharingReset: 2,
        schedulesHeld: 2,
        schedulingPending: 0,
        workflowsMoved: 3,
      }),
    ).toBe(
      'Moved to destination organization — 3 moved, 2 schedules paused until saved again, 2 shared characters limited to this brand only, 1 character grant revoked.',
    );
  });

  it('notes queued jobs that could not be cleared', () => {
    expect(
      buildRelocationToastMessage({
        membersSevered: 0,
        personaGrantsRevoked: 0,
        personasSharingReset: 0,
        schedulesHeld: 1,
        schedulingPending: 1,
        workflowsMoved: 0,
      }),
    ).toBe(
      'Moved to destination organization — 1 schedule paused until saved again. Some queued schedule jobs could not be cleared; they stop on their next run.',
    );
  });

  it('uses singular wording for one reset character', () => {
    expect(
      buildRelocationToastMessage({
        membersSevered: 0,
        personaGrantsRevoked: 0,
        personasSharingReset: 1,
        schedulesHeld: 0,
        schedulingPending: 0,
        workflowsMoved: 0,
      }),
    ).toBe(
      'Moved to destination organization — 1 shared character limited to this brand only.',
    );
  });
});
