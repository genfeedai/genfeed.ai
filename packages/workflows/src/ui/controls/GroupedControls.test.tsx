import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GroupedControls from './GroupedControls';
import type { ControlGroup } from './types';

const onEdit = vi.fn();

function buildGroups(
  overrides: Partial<{ error: string }> = {},
): ControlGroup[] {
  return [
    {
      description: 'How the subject moves.',
      fields: [
        {
          id: 'strength',
          kind: 'slider',
          label: 'Motion strength',
          max: 100,
          min: 0,
          step: 5,
          unit: '%',
          help: 'Subtle at 0, strong at 100.',
        },
        {
          id: 'sound',
          kind: 'switch',
          label: 'Keep original sound',
        },
      ],
      id: 'motion',
      label: 'Motion',
    },
    {
      fields: [
        {
          actions: [
            { id: 'edit', label: 'Edit trajectory', onSelect: onEdit },
            {
              disabledReason: 'Connect an image first.',
              id: 'draw',
              label: 'Draw trajectory',
              onSelect: vi.fn(),
            },
          ],
          error: overrides.error,
          help: 'Normalized to the image.',
          id: 'trajectory',
          kind: 'summary',
          label: 'Trajectory',
          summary: '3 points · 5 s',
        },
        {
          id: 'transfer',
          isVisible: (values) => values.mode === 'video',
          kind: 'switch',
          label: 'Reference video',
        },
      ],
      id: 'path',
      label: 'Path',
    },
  ];
}

describe('GroupedControls', () => {
  it('renders each group as a labeled region with its help text', () => {
    render(
      <GroupedControls
        groups={buildGroups()}
        onChange={vi.fn()}
        values={{ strength: 40 }}
      />,
    );

    const motion = screen.getByRole('group', { name: 'Motion' });
    expect(motion).toHaveTextContent('How the subject moves.');
    expect(motion).toHaveTextContent('40%');
    expect(motion).toHaveTextContent('Subtle at 0, strong at 100.');
    expect(screen.getByRole('group', { name: 'Path' })).toHaveTextContent(
      '3 points · 5 s',
    );
  });

  it('reports a switch change with the field id and the new value', () => {
    const onChange = vi.fn();
    render(
      <GroupedControls
        groups={buildGroups()}
        onChange={onChange}
        values={{ sound: false }}
      />,
    );

    fireEvent.click(
      screen.getByRole('switch', { name: 'Keep original sound' }),
    );

    expect(onChange).toHaveBeenCalledWith('sound', true);
  });

  it('runs a declared action and disables one that names a reason', () => {
    render(
      <GroupedControls groups={buildGroups()} onChange={vi.fn()} values={{}} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit trajectory' }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Draw trajectory' }),
    ).toBeDisabled();
  });

  it('shows a field error as an alert next to the field', () => {
    render(
      <GroupedControls
        groups={buildGroups({ error: 'Point 2 is outside the image.' })}
        onChange={vi.fn()}
        values={{}}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Point 2 is outside the image.',
    );
  });

  it('hides a field until the other values make it relevant', () => {
    const { rerender } = render(
      <GroupedControls
        groups={buildGroups()}
        onChange={vi.fn()}
        values={{ mode: 'trajectory' }}
      />,
    );
    expect(screen.queryByText('Reference video')).toBeNull();

    rerender(
      <GroupedControls
        groups={buildGroups()}
        onChange={vi.fn()}
        values={{ mode: 'video' }}
      />,
    );
    expect(screen.getByText('Reference video')).toBeTruthy();
  });
});
