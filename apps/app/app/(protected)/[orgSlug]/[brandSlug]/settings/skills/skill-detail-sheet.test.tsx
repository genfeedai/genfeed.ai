// @vitest-environment jsdom
'use client';

import { ModalEnum } from '@genfeedai/contracts';
import {
  closeModal,
  openModal,
} from '@genfeedai/helpers/ui/modal/modal.helper';
import type { Skill } from '@services/content/skills.service';
import { fireEvent, render, screen } from '@testing-library/react';
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
        onClose={vi.fn()}
        onCustomize={vi.fn()}
        onOpenTestInChat={vi.fn()}
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
      screen.getByRole('button', { name: /test with agent/i }),
    ).toBeInTheDocument();
  });

  it('renders nothing selected state when no skill is provided', () => {
    render(
      <SkillDetailSheet
        customizing={false}
        onClose={vi.fn()}
        onCustomize={vi.fn()}
        onOpenTestInChat={vi.fn()}
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
        onClose={onClose}
        onCustomize={vi.fn()}
        onOpenTestInChat={vi.fn()}
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
});
