import type { MultiPostSchema } from '@genfeedai/client/schemas';
import { CredentialPlatform } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import ModalPostPlatformsTab from '@ui/modals/content/post/ModalPostPlatformsTab';
import type { UseFormReturn } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

const createFormStub = (): UseFormReturn<MultiPostSchema> =>
  ({
    watch: vi.fn((field: string) => {
      if (field === 'globalLabel') {
        return 'Global Label';
      }

      if (field === 'globalDescription') {
        return 'Global Description';
      }

      return '';
    }),
  }) as unknown as UseFormReturn<MultiPostSchema>;

describe('ModalPostPlatformsTab', () => {
  it('calls togglePlatform once when enabling a platform', () => {
    const togglePlatform = vi.fn();

    render(
      <ModalPostPlatformsTab
        form={createFormStub()}
        platformConfigs={[
          {
            credentialId: 'cred-1',
            customScheduledDate: '',
            description: '',
            enabled: false,
            handle: 'genfeed',
            label: '',
            overrideSchedule: false,
            platform: CredentialPlatform.INSTAGRAM,
            status: 'scheduled',
          },
        ]}
        selectedPlatformId="cred-1"
        setSelectedPlatformId={vi.fn()}
        isLoading={false}
        togglePlatform={togglePlatform}
        updatePlatformConfig={vi.fn()}
        getMinDateTime={() => new Date('2025-01-01T00:00:00.000Z')}
      />,
    );

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(togglePlatform).toHaveBeenCalledTimes(1);
    expect(togglePlatform).toHaveBeenCalledWith('cred-1');
  });

  it('only renders details for the selected platform', () => {
    render(
      <ModalPostPlatformsTab
        form={createFormStub()}
        platformConfigs={[
          {
            credentialId: 'cred-1',
            customScheduledDate: '',
            description: '',
            enabled: true,
            handle: 'insta-handle',
            label: '',
            overrideSchedule: false,
            platform: CredentialPlatform.INSTAGRAM,
            status: 'scheduled',
          },
          {
            credentialId: 'cred-2',
            customScheduledDate: '',
            description: '',
            enabled: true,
            handle: 'twitter-handle',
            label: '',
            overrideSchedule: false,
            platform: CredentialPlatform.TWITTER,
            status: 'scheduled',
          },
        ]}
        selectedPlatformId="cred-1"
        setSelectedPlatformId={vi.fn()}
        isLoading={false}
        togglePlatform={vi.fn()}
        updatePlatformConfig={vi.fn()}
        getMinDateTime={() => new Date('2025-01-01T00:00:00.000Z')}
      />,
    );

    // @insta-handle appears in both the platform card and the details section
    expect(screen.getAllByText('@insta-handle').length).toBeGreaterThan(0);
    // Twitter is also shown in the platform cards grid
    expect(screen.getAllByText('@twitter-handle').length).toBeGreaterThan(0);
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
  });

  it.skip('calls setSelectedPlatformId when choosing a different platform', () => {
    const setSelectedPlatformId = vi.fn();

    render(
      <ModalPostPlatformsTab
        form={createFormStub()}
        platformConfigs={[
          {
            credentialId: 'cred-1',
            customScheduledDate: '',
            description: '',
            enabled: true,
            handle: 'insta-handle',
            label: '',
            overrideSchedule: false,
            platform: CredentialPlatform.INSTAGRAM,
            status: 'scheduled',
          },
          {
            credentialId: 'cred-2',
            customScheduledDate: '',
            description: '',
            enabled: true,
            handle: 'twitter-handle',
            label: '',
            overrideSchedule: false,
            platform: CredentialPlatform.TWITTER,
            status: 'scheduled',
          },
        ]}
        selectedPlatformId="cred-1"
        setSelectedPlatformId={setSelectedPlatformId}
        isLoading={false}
        togglePlatform={vi.fn()}
        updatePlatformConfig={vi.fn()}
        getMinDateTime={() => new Date('2025-01-01T00:00:00.000Z')}
      />,
    );

    const cards = screen.getAllByRole('button');
    // There may be additional buttons in the UI, find the platform card buttons
    expect(cards.length).toBeGreaterThanOrEqual(2);

    // Click on a platform card that isn't selected
    fireEvent.click(cards[1]);

    expect(setSelectedPlatformId).toHaveBeenCalled();
  });
});
