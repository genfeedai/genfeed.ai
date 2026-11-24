import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  SuggestionEmpty,
  SuggestionItem,
  SuggestionList,
} from './suggestion-list';

describe('SuggestionList', () => {
  it('runs the row command when a row is clicked', async () => {
    const onClick = vi.fn();
    render(
      <SuggestionList>
        <SuggestionItem isSelected={false} onClick={onClick}>
          Acme
        </SuggestionItem>
      </SuggestionList>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Acme' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('marks the keyboard row as selected inside a listbox', () => {
    render(
      <SuggestionList ariaLabel="Mentions">
        <SuggestionItem isSelected role="option">
          First
        </SuggestionItem>
        <SuggestionItem isSelected={false} role="option">
          Second
        </SuggestionItem>
      </SuggestionList>,
    );

    expect(screen.getByRole('listbox', { name: 'Mentions' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'First' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('option', { name: 'Second' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('shows the empty text', () => {
    render(
      <SuggestionList>
        <SuggestionEmpty>Nothing found</SuggestionEmpty>
      </SuggestionList>,
    );

    expect(screen.getByText('Nothing found')).toBeVisible();
  });
});
