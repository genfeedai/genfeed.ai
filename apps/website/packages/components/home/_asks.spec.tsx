import { AGENT_PROMPTS } from '@data/agent-prompts.data';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomeAsks from './_asks';

describe('HomeAsks', () => {
  it('renders every ask as its own heading', () => {
    render(<HomeAsks />);

    for (const prompt of AGENT_PROMPTS) {
      expect(
        screen.getByRole('heading', { name: `“${prompt.ask}”` }),
      ).toBeInTheDocument();
    }
  });

  it('states what comes back for each ask', () => {
    render(<HomeAsks />);

    for (const prompt of AGENT_PROMPTS) {
      expect(screen.getByText(prompt.result)).toBeInTheDocument();
    }
  });

  /*
    The section exists to route article traffic onward: an ask that does not
    link to the page continuing its promise sends the reader back to the
    homepage, which is the bounce this replaced the format grid to avoid.
  */
  it('links every ask to the audience page that continues it', () => {
    render(<HomeAsks />);

    for (const prompt of AGENT_PROMPTS) {
      expect(
        screen.getByRole('link', { name: prompt.hrefLabel }),
      ).toHaveAttribute('href', prompt.href);
    }
  });
});
