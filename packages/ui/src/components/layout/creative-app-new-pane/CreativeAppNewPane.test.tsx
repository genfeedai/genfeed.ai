import { render, screen } from '@testing-library/react';
import CreativeAppNewPane from '@ui/layout/creative-app-new-pane/CreativeAppNewPane';
import { describe, expect, it } from 'vitest';

describe('CreativeAppNewPane', () => {
  it('shows the hero and its starters above the prompt bar', () => {
    render(
      <CreativeAppNewPane
        description="Pick a starter or write your own."
        promptBar={<textarea aria-label="Prompt" />}
        title="What are we making?"
      >
        <button type="button">Starter</button>
      </CreativeAppNewPane>,
    );

    expect(
      screen.getByRole('heading', { name: 'What are we making?' }),
    ).toBeVisible();
    expect(screen.getByText('Pick a starter or write your own.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Starter' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Prompt' })).toBeVisible();
  });

  it('lets a body replace the hero while the prompt bar stays', () => {
    render(
      <CreativeAppNewPane
        body={<p>Which project?</p>}
        promptBar={<textarea aria-label="Prompt" />}
        title="What are we making?"
      >
        <button type="button">Starter</button>
      </CreativeAppNewPane>,
    );

    expect(screen.getByText('Which project?')).toBeVisible();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Starter' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Prompt' })).toBeVisible();
  });
});
