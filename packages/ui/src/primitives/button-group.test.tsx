import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ButtonGroup, ButtonGroupText } from './button-group';

describe('ButtonGroup', () => {
  it('groups its segments as one named control', () => {
    render(
      <ButtonGroup aria-label="Newsletter">
        <ButtonGroupText>Newsletter</ButtonGroupText>
        <button type="button">Subscribe</button>
      </ButtonGroup>,
    );

    const group = screen.getByRole('group', { name: 'Newsletter' });

    expect(group).toHaveTextContent('NewsletterSubscribe');
  });
});
