// @vitest-environment jsdom
'use client';

import { ModalEnum } from '@genfeedai/contracts';
import {
  closeModal,
  openModal,
} from '@genfeedai/helpers/ui/modal/modal.helper';
import type { Skill } from '@services/content/skills.service';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SkillDetailSheet from './skill-detail-sheet';

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

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  const translate = translateFromCatalog('common.settings.skills');

  return { useTranslations: () => translate };
});

describe('SkillDetailSheet', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        matches: true,
        removeEventListener: vi.fn(),
      }),
    });
    openModal(ModalEnum.SKILL);
  });

  afterEach(() => {
    closeModal(ModalEnum.SKILL);
  });

  it('renders the selected skill detail content when open', () => {
    render(
      <SkillDetailSheet
        customizing={false}
        hasChanges={false}
        draftErrors={[]}
        onClose={vi.fn()}
        onCustomize={vi.fn()}
        onOpenSamplePrompt={vi.fn()}
        onSaveSkill={vi.fn()}
        onSkillDraftChange={vi.fn()}
        savingSkill={false}
        selectedSkill={selectedSkillFixture}
        skillDraft={{
          defaultInstructions: 'Base instructions',
          description: 'Sets up long-form creator scripts.',
          name: 'YouTube Script Setup',
          systemPromptTemplate: '',
        }}
      />,
    );

    expect(screen.getAllByText('YouTube Script Setup')[0]).toBeVisible();
    expect(
      screen.getByRole('button', { name: /open sample prompt/i }),
    ).toBeInTheDocument();
  });

  it('renders nothing selected state when no skill is provided', () => {
    render(
      <SkillDetailSheet
        customizing={false}
        hasChanges={false}
        draftErrors={[]}
        onClose={vi.fn()}
        onCustomize={vi.fn()}
        onOpenSamplePrompt={vi.fn()}
        onSaveSkill={vi.fn()}
        onSkillDraftChange={vi.fn()}
        savingSkill={false}
        selectedSkill={null}
        skillDraft={{
          defaultInstructions: '',
          description: '',
          name: '',
          systemPromptTemplate: '',
        }}
      />,
    );

    expect(
      screen.getByText(/select a skill from the catalog/i),
    ).toBeInTheDocument();
  });

  it('calls onClose when the overlay is closed', () => {
    const onClose = vi.fn();
    render(
      <SkillDetailSheet
        customizing={false}
        hasChanges={false}
        draftErrors={[]}
        onClose={onClose}
        onCustomize={vi.fn()}
        onOpenSamplePrompt={vi.fn()}
        onSaveSkill={vi.fn()}
        onSkillDraftChange={vi.fn()}
        savingSkill={false}
        selectedSkill={selectedSkillFixture}
        skillDraft={{
          defaultInstructions: '',
          description: '',
          name: '',
          systemPromptTemplate: '',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('announces the operation recovery error inside the open dialog while preserving the fork lock', () => {
    const onFork = vi.fn();
    const error =
      'The fork was created, but its details could not be loaded. Refresh the catalog.';
    render(
      <SkillDetailSheet
        customizing={false}
        error={error}
        hasChanges={false}
        draftErrors={[]}
        isForkBlocked
        onClose={vi.fn()}
        onCustomize={onFork}
        onOpenSamplePrompt={vi.fn()}
        onSaveSkill={vi.fn()}
        onSkillDraftChange={vi.fn()}
        savingSkill={false}
        selectedSkill={selectedSkillFixture}
        skillDraft={{
          defaultInstructions: 'Base instructions',
          description: 'Sets up long-form creator scripts.',
          name: 'YouTube Script Setup',
          systemPromptTemplate: '',
        }}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('alert')).toBeVisible();
    expect(within(dialog).getByRole('alert')).toHaveTextContent(error);
    const fork = within(dialog).getByRole('button', { name: 'Fork' });
    expect(fork).toBeDisabled();
    fireEvent.click(fork);
    expect(onFork).not.toHaveBeenCalled();
  });
  it('offers versions only with authoritative read capability and controlled callbacks', () => {
    const onLoad = vi.fn();
    const versions = {
      items: [],
      detail: null,
      hasLoaded: false,
      hasMore: false,
      isLoading: false,
      isDisabled: false,
      error: null,
      onLoad,
      onLoadOlder: vi.fn(),
      onView: vi.fn(),
    };
    const value = {
      customizing: false,
      hasChanges: false,
      draftErrors: [],
      onClose: vi.fn(),
      onCustomize: vi.fn(),
      onOpenSamplePrompt: vi.fn(),
      onSaveSkill: vi.fn(),
      onSkillDraftChange: vi.fn(),
      savingSkill: false,
      skillDraft: {
        name: 'Name',
        description: 'Description',
        defaultInstructions: '',
        systemPromptTemplate: '',
      },
      versions,
    };
    const view = render(
      <SkillDetailSheet
        {...value}
        selectedSkill={{ ...selectedSkillFixture, canRead: true }}
      />,
    );
    expect(onLoad).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Load versions' }));
    expect(onLoad).toHaveBeenCalledOnce();
    view.rerender(
      <SkillDetailSheet
        {...value}
        selectedSkill={{ ...selectedSkillFixture, canRead: false }}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Load versions' }),
    ).not.toBeInTheDocument();
  });
});
