import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PublishPostCard } from '@genfeedai/agent/components/PublishPostCard';
import type {
  AgentPublishTargetProposal,
  AgentUiAction,
} from '@genfeedai/agent/models/agent-chat.model';
import { PostVisibility } from '@genfeedai/contracts';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/data/content/use-posting-sets/use-posting-sets', () => ({
  usePostingSets: () => ({
    createSet: vi.fn(),
    expandError: null,
    expandSet: vi.fn(),
    isExpanding: false,
    isLoading: false,
    isSaving: false,
    saveError: null,
    sets: [],
  }),
}));

vi.mock(
  '@hooks/data/content/use-posting-signatures/use-posting-signatures',
  () => ({
    usePostingSignatures: () => ({
      isLoading: false,
      signatures: [],
    }),
  }),
);

function makeTarget(
  overrides: Partial<AgentPublishTargetProposal>,
): AgentPublishTargetProposal {
  return {
    blockers: [],
    credentialId: 'cred-1',
    id: 'publish-target-cred-1',
    isSelected: true,
    label: 'LinkedIn',
    media: [{ id: 'ingredient-1', kind: 'image' }],
    platform: 'linkedin',
    settingFields: [
      {
        defaultValue: 'PUBLIC',
        key: 'visibility',
        label: 'Visibility',
        options: [
          { label: 'Public', value: 'PUBLIC' },
          { label: 'Connections', value: 'CONNECTIONS' },
        ],
        type: 'select',
      },
    ],
    settings: { visibility: 'PUBLIC' },
    visibility: PostVisibility.PUBLIC,
    warnings: [],
    ...overrides,
  };
}

describe('PublishPostCard', () => {
  it('resolves field labels through the host agent catalog', () => {
    const source = readFileSync(join(__dirname, 'PublishPostCard.tsx'), 'utf8');
    expect(source).toContain("useTranslations('agent.publishPostCard')");
    expect(source).not.toContain('const COPY =');
  });

  it('renders defaults and submits confirm_publish_post through the shared UI action handler', async () => {
    const onUiAction = vi.fn().mockResolvedValue(undefined);
    const action: AgentUiAction = {
      contentId: 'ingredient-1',
      data: {
        availablePlatforms: ['linkedin', 'twitter'],
      },
      description: 'Review and confirm.',
      id: 'publish-card-1',
      platforms: ['linkedin'],
      textContent: 'Initial caption',
      title: 'Publish selected content',
      type: 'publish_post_card',
    };

    render(<PublishPostCard action={action} onUiAction={onUiAction} />);

    fireEvent.change(screen.getByPlaceholderText('Optional caption override'), {
      target: { value: 'Updated caption' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'twitter' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm publish' }));
    });

    expect(onUiAction).toHaveBeenCalledWith('confirm_publish_post', {
      caption: 'Updated caption',
      contentId: 'ingredient-1',
      platforms: ['linkedin', 'twitter'],
      scheduledAt: undefined,
      sourceActionId: 'publish-card-1',
      visibility: PostVisibility.PUBLIC,
    });
  });

  it('disables confirmation when no platforms are selected', () => {
    const action: AgentUiAction = {
      contentId: 'ingredient-2',
      data: {
        availablePlatforms: ['linkedin'],
      },
      id: 'publish-card-2',
      platforms: ['linkedin'],
      title: 'Publish selected content',
      type: 'publish_post_card',
    };

    render(<PublishPostCard action={action} />);

    fireEvent.click(screen.getByRole('button', { name: 'linkedin' }));

    expect(
      screen.getByRole('button', { name: 'Confirm publish' }),
    ).toBeDisabled();
  });

  it('normalizes a browser-local schedule before submitting the confirmed action', async () => {
    const onUiAction = vi.fn().mockResolvedValue(undefined);
    const action: AgentUiAction = {
      contentId: 'ingredient-3',
      data: {
        availablePlatforms: ['instagram'],
      },
      id: 'publish-card-3',
      platforms: ['instagram'],
      title: 'Schedule selected content',
      type: 'publish_post_card',
    };
    const localSchedule = '2026-07-18T09:00';

    render(<PublishPostCard action={action} onUiAction={onUiAction} />);

    fireEvent.change(screen.getByLabelText('Schedule for later'), {
      target: { value: localSchedule },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm schedule' }));
    });

    expect(onUiAction).toHaveBeenCalledWith('confirm_publish_post', {
      caption: undefined,
      contentId: 'ingredient-3',
      platforms: ['instagram'],
      scheduledAt: new Date(localSchedule).toISOString(),
      sourceActionId: 'publish-card-3',
      visibility: PostVisibility.PUBLIC,
    });
  });

  it('renders a prefilled ISO schedule as a datetime-local value', () => {
    const scheduledAt = '2026-07-18T09:00:00.000Z';
    const scheduledDate = new Date(scheduledAt);
    const pad = (part: number): string => String(part).padStart(2, '0');
    const expectedLocalValue = `${scheduledDate.getFullYear()}-${pad(scheduledDate.getMonth() + 1)}-${pad(scheduledDate.getDate())}T${pad(scheduledDate.getHours())}:${pad(scheduledDate.getMinutes())}`;
    const action: AgentUiAction = {
      contentId: 'ingredient-4',
      data: {
        availablePlatforms: ['linkedin'],
      },
      id: 'publish-card-4',
      platforms: ['linkedin'],
      scheduledAt,
      title: 'Schedule selected content',
      type: 'publish_post_card',
    };

    render(<PublishPostCard action={action} />);

    expect(screen.getByLabelText('Schedule for later')).toHaveValue(
      expectedLocalValue,
    );
  });

  it('shows every target and its effective per-channel content and settings', () => {
    const action: AgentUiAction = {
      contentId: 'ingredient-1',
      id: 'publish-card-multi',
      platforms: ['linkedin', 'twitter'],
      targets: [
        makeTarget({
          caption: 'Shared caption',
          credentialId: 'cred-linkedin',
          id: 'publish-target-cred-linkedin',
          label: 'LinkedIn',
          platform: 'linkedin',
        }),
        makeTarget({
          caption: 'Shared caption',
          credentialId: 'cred-twitter',
          id: 'publish-target-cred-twitter',
          label: 'X (Twitter)',
          platform: 'twitter',
          settingFields: [
            {
              defaultValue: 'everyone',
              key: 'replyPolicy',
              label: 'Who can reply',
              options: [
                { label: 'Everyone', value: 'everyone' },
                { label: 'Mentioned accounts', value: 'mentioned' },
              ],
              type: 'select',
            },
          ],
          settings: { replyPolicy: 'everyone' },
        }),
      ],
      textContent: 'Shared caption',
      title: 'Publish selected content',
      type: 'publish_post_card',
    };

    render(<PublishPostCard action={action} />);

    expect(screen.getByLabelText('LinkedIn caption')).toBeInTheDocument();
    expect(screen.getByLabelText('X (Twitter) caption')).toBeInTheDocument();
    expect(screen.getByLabelText('Who can reply')).toHaveTextContent(
      'Everyone',
    );
    expect(
      screen.getByRole('button', { name: 'linkedin' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'twitter' })).toBeInTheDocument();
  });

  it('preserves other targets and the shared caption when one channel is edited', async () => {
    const onUiAction = vi.fn().mockResolvedValue(undefined);
    const action: AgentUiAction = {
      contentId: 'ingredient-1',
      id: 'publish-card-edit',
      platforms: ['linkedin', 'twitter'],
      targets: [
        makeTarget({
          credentialId: 'cred-linkedin',
          id: 'publish-target-cred-linkedin',
          label: 'LinkedIn',
          platform: 'linkedin',
        }),
        makeTarget({
          credentialId: 'cred-twitter',
          id: 'publish-target-cred-twitter',
          label: 'X (Twitter)',
          platform: 'twitter',
          settingFields: [
            {
              defaultValue: 'everyone',
              key: 'replyPolicy',
              label: 'Who can reply',
              options: [
                { label: 'Everyone', value: 'everyone' },
                { label: 'Mentioned accounts', value: 'mentioned' },
              ],
              type: 'select',
            },
          ],
          settings: { replyPolicy: 'everyone' },
        }),
      ],
      textContent: 'Shared caption',
      title: 'Publish selected content',
      type: 'publish_post_card',
    };

    render(<PublishPostCard action={action} onUiAction={onUiAction} />);

    fireEvent.change(screen.getByLabelText('X (Twitter) caption'), {
      target: { value: 'X-only caption' },
    });
    expect(screen.getByLabelText('LinkedIn caption')).toHaveValue('');
    expect(
      screen.getByPlaceholderText('Optional caption override'),
    ).toHaveValue('Shared caption');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm publish' }));
    });

    expect(onUiAction).toHaveBeenCalledWith(
      'confirm_publish_post',
      expect.objectContaining({
        caption: 'Shared caption',
        targets: [
          expect.objectContaining({
            caption: 'Shared caption',
            credentialId: 'cred-linkedin',
            platform: 'linkedin',
          }),
          expect.objectContaining({
            caption: 'X-only caption',
            credentialId: 'cred-twitter',
            platform: 'twitter',
          }),
        ],
      }),
    );
  });

  it('blocks confirmation with a target-specific capability reason', () => {
    const action: AgentUiAction = {
      contentId: 'ingredient-1',
      id: 'publish-card-blocked',
      platforms: ['youtube'],
      targets: [
        makeTarget({
          credentialId: 'cred-youtube',
          id: 'publish-target-cred-youtube',
          label: 'YouTube',
          media: [{ id: 'ingredient-1', kind: 'image' }],
          platform: 'youtube',
          settingFields: [
            {
              defaultValue: 'private',
              key: 'privacyStatus',
              label: 'Privacy',
              options: [
                { label: 'Public', value: 'public' },
                { label: 'Private', value: 'private' },
              ],
              required: true,
              type: 'select',
            },
          ],
          settings: { madeForKids: false, privacyStatus: 'private' },
        }),
      ],
      textContent: 'Launch clip',
      title: 'Publish selected content',
      type: 'publish_post_card',
    };

    render(<PublishPostCard action={action} />);

    expect(
      screen.getByText('YouTube does not support image media.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Confirm publish' }),
    ).toBeDisabled();
  });
});
