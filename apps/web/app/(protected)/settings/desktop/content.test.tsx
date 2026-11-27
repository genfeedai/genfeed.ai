import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DesktopContent from './content';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../tests/next-intl.stub'
  );
  const translate = translateFromCatalog('pages.desktopSettings');
  return { useTranslations: () => translate };
});

const surface = vi.hoisted(() => ({ value: 'web' as 'desktop' | 'web' }));
vi.mock('@genfeedai/config/deployment', () => ({
  getClientSurface: () => surface.value,
}));
vi.mock('@/components/desktop/DesktopWorkspaceSettings', () => ({
  default: () => <section>Workspace card</section>,
}));
vi.mock('@/components/desktop/DesktopEditingToolsSettings', () => ({
  default: () => <section>Editing tools card</section>,
}));

describe('Desktop settings page', () => {
  beforeEach(() => {
    surface.value = 'web';
  });

  it('tells a browser visitor the page belongs to the Desktop app', () => {
    render(<DesktopContent />);

    expect(
      screen.getByText(
        'Workspace folders and editing tools are part of the Genfeed Desktop app.',
      ),
    ).toBeVisible();
    expect(screen.queryByText('Workspace card')).not.toBeInTheDocument();
  });

  it('shows the workspace and the editing tools in the Desktop app', () => {
    surface.value = 'desktop';
    render(<DesktopContent />);

    expect(screen.getByText('Workspace card')).toBeVisible();
    expect(screen.getByText('Editing tools card')).toBeVisible();
  });
});
