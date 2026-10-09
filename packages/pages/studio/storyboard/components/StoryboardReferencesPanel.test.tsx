import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StoryboardReferencesPanel from './StoryboardReferencesPanel';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('@genfeedai/agent/components/AgentMediaArtifactPreview', () => ({
  AgentMediaArtifactPreview: () => null,
}));

describe('Storyboard references', () => {
  it('filters actual references by title or group and removes only the selected item', () => {
    const remove = vi.fn();
    render(
      <StoryboardReferencesPanel
        references={[
          {
            id: 'a',
            title: 'Warm light',
            group: 'Style references',
            kind: 'image',
            onRemove: remove,
          },
          { id: 'b', title: 'Founder', group: 'Characters', kind: 'image' },
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText('Find a reference…'), {
      target: { value: 'style' },
    });
    expect(screen.getByText('Warm light')).toBeInTheDocument();
    expect(screen.queryByText('Founder')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Warm light' }));
    expect(remove).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('Find a reference…'), {
      target: { value: 'missing' },
    });
    expect(
      screen.getByText('No references match your search.'),
    ).toBeInTheDocument();
  });
  it('lets a shot reference select the matching editor without fabricating empty media', () => {
    const select = vi.fn();
    render(
      <StoryboardReferencesPanel
        references={[
          {
            id: 'shot-1',
            title: 'Shot 1',
            group: 'Shots',
            kind: 'image',
            onSelect: select,
            isSelected: true,
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Shot 1' }));
    expect(select).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Shot 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
