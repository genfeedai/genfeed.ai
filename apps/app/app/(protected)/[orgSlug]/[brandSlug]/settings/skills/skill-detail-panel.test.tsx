// @vitest-environment jsdom
'use client';

import {
  ContextSidebarOutlet,
  ContextSidebarProvider,
  useContextSidebar,
} from '@contexts/ui/context-sidebar-context';
import type { Skill } from '@services/content/skills.service';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import SkillDetailPanel from './skill-detail-panel';

const selectedSkillFixture: Skill = {
  channels: ['youtube'],
  defaultInstructions: 'Base instructions',
  description: 'Sets up long-form creator scripts.',
  id: 'skill-1',
  isBuiltIn: true,
  isEnabled: true,
  modalities: ['text'],
  name: 'YouTube Script Setup',
  organization: null,
  canEdit: false,
  canFork: true,
  requiredProviders: ['openai'],
  slug: 'youtube-script-setup',
  source: 'built_in',
  status: 'published',
  workflowStage: 'creation',
} as Skill;

const emptyDraft = {
  defaultInstructions: '',
  description: '',
  name: '',
  systemPromptTemplate: '',
};

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  const translate = translateFromCatalog('common.settings.skills');

  return { useTranslations: () => translate };
});

let closeSidebar: () => void = () => undefined;

function SidebarCloser(): null {
  closeSidebar = useContextSidebar()?.close ?? (() => undefined);
  return null;
}

function renderInSidebar(ui: ReactNode) {
  return render(
    <ContextSidebarProvider>
      <ContextSidebarOutlet testId="sidebar-outlet" />
      <SidebarCloser />
      {ui}
    </ContextSidebarProvider>,
  );
}

const baseProps = {
  customizing: false,
  draftErrors: [],
  hasChanges: false,
  onClose: vi.fn(),
  onCustomize: vi.fn(),
  onOpenSamplePrompt: vi.fn(),
  onSaveSkill: vi.fn(),
  onSkillDraftChange: vi.fn(),
  savingSkill: false,
  skillDraft: {
    defaultInstructions: 'Base instructions',
    description: 'Sets up long-form creator scripts.',
    name: 'YouTube Script Setup',
    systemPromptTemplate: '',
  },
};

describe('SkillDetailPanel', () => {
  it('renders the selected skill detail in the context sidebar', async () => {
    renderInSidebar(
      <SkillDetailPanel {...baseProps} selectedSkill={selectedSkillFixture} />,
    );

    const outlet = await screen.findByTestId('sidebar-outlet');
    expect(
      within(outlet).getByText('youtube-script-setup'),
    ).toBeInTheDocument();
    expect(
      within(outlet).getByRole('button', { name: /open sample prompt/i }),
    ).toBeInTheDocument();
  });

  it('renders nothing while no skill is selected', () => {
    renderInSidebar(
      <SkillDetailPanel
        {...baseProps}
        selectedSkill={null}
        skillDraft={emptyDraft}
      />,
    );

    expect(screen.getByTestId('sidebar-outlet')).toBeEmptyDOMElement();
  });

  it('calls onClose when the sidebar is closed', async () => {
    const onClose = vi.fn();
    renderInSidebar(
      <SkillDetailPanel
        {...baseProps}
        onClose={onClose}
        selectedSkill={selectedSkillFixture}
        skillDraft={emptyDraft}
      />,
    );
    await screen.findByText('youtube-script-setup');

    act(() => closeSidebar());

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('announces the operation recovery error inside the sidebar while preserving the fork lock', async () => {
    const onFork = vi.fn();
    const error =
      'The fork was created, but its details could not be loaded. Refresh the catalog.';
    renderInSidebar(
      <SkillDetailPanel
        {...baseProps}
        error={error}
        isForkBlocked
        onCustomize={onFork}
        selectedSkill={selectedSkillFixture}
      />,
    );

    const outlet = await screen.findByTestId('sidebar-outlet');
    expect(within(outlet).getByRole('alert')).toHaveTextContent(error);
    const fork = within(outlet).getByRole('button', { name: 'Fork' });
    expect(fork).toBeDisabled();
    fireEvent.click(fork);
    expect(onFork).not.toHaveBeenCalled();
  });

  it('offers versions only with authoritative read capability and controlled callbacks', async () => {
    const onLoad = vi.fn();
    const versions = {
      detail: null,
      error: null,
      hasLoaded: false,
      hasMore: false,
      isDisabled: false,
      isLoading: false,
      items: [],
      onLoad,
      onLoadOlder: vi.fn(),
      onView: vi.fn(),
    };
    const view = renderInSidebar(
      <SkillDetailPanel
        {...baseProps}
        selectedSkill={{ ...selectedSkillFixture, canRead: true }}
        versions={versions}
      />,
    );

    const load = await screen.findByRole('button', { name: 'Load versions' });
    expect(onLoad).not.toHaveBeenCalled();
    fireEvent.click(load);
    expect(onLoad).toHaveBeenCalledOnce();

    view.rerender(
      <ContextSidebarProvider>
        <ContextSidebarOutlet testId="sidebar-outlet" />
        <SidebarCloser />
        <SkillDetailPanel
          {...baseProps}
          selectedSkill={{ ...selectedSkillFixture, canRead: false }}
          versions={versions}
        />
      </ContextSidebarProvider>,
    );
    expect(
      screen.queryByRole('button', { name: 'Load versions' }),
    ).not.toBeInTheDocument();
  });
});
