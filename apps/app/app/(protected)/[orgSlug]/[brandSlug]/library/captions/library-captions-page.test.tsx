import { render, screen } from '@testing-library/react';
import LibraryCaptionsPage from './library-captions-page';
import '@testing-library/jest-dom';
import { describe, expect, it } from 'vitest';

describe('LibraryCaptionsPage', () => {
  it('renders the captions library header and description', () => {
    render(
      <LibraryCaptionsPage>
        <div>Captions content</div>
      </LibraryCaptionsPage>,
    );

    expect(screen.getByText('Captions')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Browse generated captions, subtitle files, and transcript text for your library content.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Captions content')).toBeInTheDocument();
  });
});
