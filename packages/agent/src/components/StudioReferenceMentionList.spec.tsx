import '@testing-library/jest-dom/vitest';
import StudioReferenceMentionList from '@genfeedai/agent/components/StudioReferenceMentionList';
import type {
  StudioMentionSuggestion,
  StudioReferenceMentionListHandle,
} from '@genfeedai/props/studio/studio-reference-mention.props';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

const items: StudioMentionSuggestion[] = [
  {
    kind: 'reference',
    reference: {
      id: 'person',
      key: 'person',
      token: '@Image1',
      name: 'Person',
      kind: 'image',
      previewUrl: '/person.png',
      role: 'reference',
      source: 'library',
    },
  },
  {
    kind: 'reference',
    reference: {
      id: 'voice',
      key: 'voice',
      token: '@Audio1',
      name: 'Voice',
      kind: 'audio',
      role: 'audioReference',
      source: 'library',
    },
  },
];

describe('Studio reference suggestions', () => {
  it('shows thumbnail, token and role and supports pointer selection', () => {
    const command = vi.fn();
    render(<StudioReferenceMentionList command={command} items={items} />);
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByText('Audio reference')).toBeVisible();
    expect(
      screen
        .getByRole('option', { name: /@Image1: Person. Reference/ })
        .querySelector('img'),
    ).toHaveAttribute('src', '/person.png');
    fireEvent.click(screen.getByRole('option', { name: /@Audio1/ }));
    expect(command).toHaveBeenCalledWith(items[1]);
  });

  it('wraps keyboard selection and safely handles empty results', () => {
    const command = vi.fn();
    const ref = createRef<StudioReferenceMentionListHandle>();
    const { rerender } = render(
      <StudioReferenceMentionList command={command} items={items} ref={ref} />,
    );
    act(() => {
      ref.current?.onKeyDown({
        event: new KeyboardEvent('keydown', { key: 'ArrowUp' }),
      });
    });
    expect(screen.getByRole('option', { name: /@Audio1/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    act(() => {
      ref.current?.onKeyDown({
        event: new KeyboardEvent('keydown', { key: 'Enter' }),
      });
    });
    expect(command).toHaveBeenCalledWith(items[1]);
    rerender(
      <StudioReferenceMentionList command={command} items={[]} ref={ref} />,
    );
    expect(
      ref.current?.onKeyDown({
        event: new KeyboardEvent('keydown', { key: 'ArrowDown' }),
      }),
    ).toBe(false);
  });
});
