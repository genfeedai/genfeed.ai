// @vitest-environment jsdom
import type { SkillVersionsPanelProps } from '@props/settings/skills.props';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SkillVersionsPanel from './skill-versions-panel';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  return {
    useTranslations: () => translateFromCatalog('common.settings.skills'),
  };
});
function props(): SkillVersionsPanelProps {
  return {
    items: [],
    detail: null,
    hasLoaded: false,
    hasMore: false,
    isLoading: false,
    isDisabled: false,
    error: null,
    onLoad: vi.fn(),
    onLoadOlder: vi.fn(),
    onView: vi.fn(),
  };
}
describe('SkillVersionsPanel explicit bounded reads', () => {
  it('does not fetch on render and exposes explicit first/older/detail actions only', () => {
    const value = props();
    const view = render(<SkillVersionsPanel {...value} />);
    expect(value.onLoad).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Load versions' }));
    expect(value.onLoad).toHaveBeenCalledOnce();
    view.rerender(
      <SkillVersionsPanel
        {...value}
        hasLoaded
        hasMore
        items={[
          {
            id: 'sv1_skill-1_3',
            versionNumber: 3,
            createdAt: '2026-10-02T10:20:30.000Z',
            contentHash: `sha256:skill-v1:${'a'.repeat(64)}`,
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Load older' }));
    expect(value.onLoadOlder).toHaveBeenCalledOnce();
    fireEvent.click(
      screen.getByRole('button', { name: 'View instructions for version 3' }),
    );
    expect(value.onView).toHaveBeenCalledWith('sv1_skill-1_3');
    expect(
      screen.queryByRole('button', {
        name: /export|download|rollback|publish|test/i,
      }),
    ).not.toBeInTheDocument();
  });
  it.each([
    '',
    ' \n\t ',
    '<img src=x onerror=alert(1)>\n<script>literal</script>',
  ])('renders exact escaped instruction text %j', (instructionText) => {
    const value = props();
    const { container } = render(
      <SkillVersionsPanel
        {...value}
        detail={{
          id: 'sv1_skill-1_3',
          versionNumber: 3,
          createdAt: '2026-10-02T10:20:30.000Z',
          contentHash: `sha256:skill-v1:${'a'.repeat(64)}`,
          instructionText,
        }}
      />,
    );
    expect(screen.getByLabelText('Version instructions').textContent).toBe(
      instructionText,
    );
    expect(container.querySelector('img,script')).toBeNull();
    if (instructionText === '')
      expect(
        screen.getByText('This version has empty instructions.'),
      ).toBeVisible();
  });
  it('disables concurrent reads and distinguishes an empty list from an unavailable response', () => {
    const value = props();
    const view = render(<SkillVersionsPanel {...value} isLoading />);
    expect(
      screen.getByRole('button', { name: 'Loading versions…' }),
    ).toBeDisabled();
    view.rerender(<SkillVersionsPanel {...value} hasLoaded />);
    expect(screen.getByText('No readable versions.')).toBeVisible();
    view.rerender(
      <SkillVersionsPanel {...value} error="Skill versions are unavailable." />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Skill versions are unavailable.',
    );
  });
});
