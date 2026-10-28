import { describe, expect, it } from 'vitest';
import { MAX_AGENT_TASKS, readAgentTaskList } from './agent-task-list.constant';

describe('readAgentTaskList', () => {
  it('reads a valid list in order and trims text', () => {
    expect(
      readAgentTaskList([
        { id: 'script', label: ' Write the script ', status: 'completed' },
        {
          detail: 'Scene 2 of 4',
          id: 'shots',
          label: 'Shots',
          status: 'active',
        },
        { id: 'grade', label: 'Grade', status: 'pending' },
      ]),
    ).toEqual([
      { id: 'script', label: 'Write the script', status: 'completed' },
      { detail: 'Scene 2 of 4', id: 'shots', label: 'Shots', status: 'active' },
      { id: 'grade', label: 'Grade', status: 'pending' },
    ]);
  });

  it.each([
    ['not an array', 'tasks'],
    ['empty', []],
    ['an entry that is not an object', ['shots']],
    ['a missing label', [{ id: 'a', status: 'pending' }]],
    ['a blank id', [{ id: ' ', label: 'A', status: 'pending' }]],
    ['an unknown status', [{ id: 'a', label: 'A', status: 'running' }]],
    [
      'a repeated id',
      [
        { id: 'a', label: 'A', status: 'pending' },
        { id: 'a', label: 'B', status: 'pending' },
      ],
    ],
    [
      'too many tasks',
      Array.from({ length: MAX_AGENT_TASKS + 1 }, (_, index) => ({
        id: `t${index}`,
        label: `Task ${index}`,
        status: 'pending',
      })),
    ],
  ])('rejects %s', (_name, value) => {
    expect(readAgentTaskList(value)).toBeNull();
  });
});
