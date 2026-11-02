import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EditorWorkspace from './EditorWorkspace';

const mocks = vi.hoisted(() => ({ search: new URLSearchParams() }));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.search,
}));
vi.mock('./EditorCreatePane', () => ({
  default: () => <p>New pane</p>,
}));
vi.mock('./EditorProjectsPane', () => ({
  default: () => <p>Projects pane</p>,
}));
vi.mock('./EditorVideoImport', () => ({
  default: ({ videoIds }: { videoIds: string[] }) => (
    <p role="status">Importing {videoIds.join(',')}</p>
  ),
}));

describe('EditorWorkspace', () => {
  beforeEach(() => {
    mocks.search = new URLSearchParams();
  });

  it('shows the projects when no video was passed', () => {
    render(<EditorWorkspace />);

    expect(screen.getByText('Projects pane')).toBeVisible();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('turns Library videos into a project, in URL order', () => {
    mocks.search = new URLSearchParams('video=shot-2&video=&video=shot-1');

    render(<EditorWorkspace />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Importing shot-2,shot-1',
    );
    expect(screen.queryByText('Projects pane')).not.toBeInTheDocument();
  });
});
