import type { MultiPostSchema } from '@genfeedai/client/schemas';
import { CredentialPlatform } from '@genfeedai/enums';
import { fireEvent, render, screen, within } from '@testing-library/react';
import ModalPostPlatformsTab from '@ui/modals/content/post/ModalPostPlatformsTab';
import type { UseFormReturn } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

const TEST_MIN_DATE = new Date('2025-01-01T00:00:00.000Z');

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
        getMinDateTime={() => TEST_MIN_DATE}
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
        getMinDateTime={() => TEST_MIN_DATE}
      />,
    );

    // @insta-handle appears in both the platform card and the details section
    expect(screen.getAllByText('@insta-handle').length).toBeGreaterThan(0);
    // Twitter is also shown in the platform cards grid
    expect(screen.getAllByText('@twitter-handle').length).toBeGreaterThan(0);
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
  });

  it('renders a live platform preview bound to the enabled configs', () => {
    render(
      <ModalPostPlatformsTab
        form={createFormStub()}
        platformConfigs={[
          {
            credentialId: 'cred-2',
            customScheduledDate: '',
            description: 'Hello from the live preview',
            enabled: true,
            handle: 'twitter-handle',
            label: '',
            overrideSchedule: false,
            platform: CredentialPlatform.TWITTER,
            status: 'scheduled',
          },
        ]}
        selectedPlatformId="cred-2"
        setSelectedPlatformId={vi.fn()}
        isLoading={false}
        togglePlatform={vi.fn()}
        updatePlatformConfig={vi.fn()}
        getMinDateTime={() => TEST_MIN_DATE}
      />,
    );

    expect(screen.getByText('Live preview')).toBeInTheDocument();
    // The settings textarea holds the same string, so scope to the preview.
    const preview = screen.getByLabelText('Platform preview');
    expect(
      within(preview).getByText('Hello from the live preview'),
    ).toBeInTheDocument();
  });

  it('hides and restores the preview via the toggle', () => {
    render(
      <ModalPostPlatformsTab
        form={createFormStub()}
        platformConfigs={[
          {
            credentialId: 'cred-2',
            customScheduledDate: '',
            description: 'Toggle me',
            enabled: true,
            handle: 'twitter-handle',
            label: '',
            overrideSchedule: false,
            platform: CredentialPlatform.TWITTER,
            status: 'scheduled',
          },
        ]}
        selectedPlatformId="cred-2"
        setSelectedPlatformId={vi.fn()}
        isLoading={false}
        togglePlatform={vi.fn()}
        updatePlatformConfig={vi.fn()}
        getMinDateTime={() => TEST_MIN_DATE}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /hide preview/i }));
    expect(screen.queryByLabelText('Platform preview')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show preview/i }));
    expect(screen.getByLabelText('Platform preview')).toBeInTheDocument();
  });

  it('renders no preview section while every platform is disabled', () => {
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
        togglePlatform={vi.fn()}
        updatePlatformConfig={vi.fn()}
        getMinDateTime={() => TEST_MIN_DATE}
      />,
    );

    expect(screen.queryByText('Live preview')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Platform preview')).not.toBeInTheDocument();
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
        getMinDateTime={() => TEST_MIN_DATE}
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
