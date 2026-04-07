import { CredentialPlatform } from '@genfeedai/enums';
import type { ICredential } from '@genfeedai/interfaces';
// @ts-expect-error storybook types not available
import type { Meta, StoryObj } from '@storybook/react';
import PlatformSelector from '@ui/forms/selectors/platform-selector/PlatformSelector';
import { useState } from 'react';

const mockCredentials: ICredential[] = [
  {
    externalHandle: '@mychannel',
    externalId: 'UC1234567890',
    id: 'cred-youtube-1',
    label: 'My YouTube Channel',
    platform: CredentialPlatform.YOUTUBE,
  } as ICredential,
  {
    externalHandle: '@mytwitter',
    externalId: '1234567890',
    id: 'cred-twitter-1',
    label: 'Personal Twitter',
    platform: CredentialPlatform.TWITTER,
  } as ICredential,
  {
    externalHandle: '@brandinstagram',
    externalId: '9876543210',
    id: 'cred-instagram-1',
    label: 'Brand Instagram',
    platform: CredentialPlatform.INSTAGRAM,
  } as ICredential,
  {
    externalHandle: '@mytiktok',
    externalId: '5555555555',
    id: 'cred-tiktok-1',
    platform: CredentialPlatform.TIKTOK,
  } as ICredential,
];

const meta = {
  component: PlatformSelector,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  title: 'Forms/Selectors/PlatformSelector',
} satisfies Meta<typeof PlatformSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Render() {
    const [selectedId, setSelectedId] = useState('cred-youtube-1');
    const selectedCred = mockCredentials.find((c) => c.id === selectedId);

    return (
      <div className="max-w-2xl">
        <h3 className="text-lg font-bold mb-4">Select Platform Account</h3>
        <PlatformSelector
          credentials={mockCredentials}
          selectedCredentialId={selectedId}
          onSelect={setSelectedId}
        />
        <div className="mt-4 p-4 bg-background">
          <p className="text-sm">
            <strong>Selected:</strong>{' '}
            {selectedCred
              ? `${selectedCred.platform} (${selectedCred.label || selectedCred.externalHandle})`
              : 'None'}
          </p>
        </div>
      </div>
    );
  },
};

export const TwoCredentials: Story = {
  render: function Render() {
    const [selectedId, setSelectedId] = useState('cred-youtube-1');

    return (
      <div className="max-w-2xl">
        <h3 className="text-lg font-bold mb-4">Limited Platforms</h3>
        <PlatformSelector
          credentials={mockCredentials.slice(0, 2)}
          selectedCredentialId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
    );
  },
};

export const WithLongHandles: Story = {
  render: function Render() {
    const [selectedId, setSelectedId] = useState('cred-1');
    const longHandleCredentials: ICredential[] = [
      {
        externalHandle: '@verylonghandlethatgoesonandonshouldtruncate',
        externalId: 'UC1234567890',
        id: 'cred-1',
        label: 'My Super Long YouTube Channel Name That Gets Truncated',
        platform: CredentialPlatform.YOUTUBE,
      } as ICredential,
      {
        externalHandle: '@extremelylonghandlenamethatgoespastthemaxwidth',
        externalId: '1234567890',
        id: 'cred-2',
        platform: CredentialPlatform.TWITTER,
      } as ICredential,
    ];

    return (
      <div className="max-w-2xl">
        <h3 className="text-lg font-bold mb-4">Long Handles (Truncated)</h3>
        <PlatformSelector
          credentials={longHandleCredentials}
          selectedCredentialId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
    );
  },
};

export const Disabled: Story = {
  render: function Render() {
    const [selectedId, setSelectedId] = useState('cred-youtube-1');

    return (
      <div className="max-w-2xl">
        <h3 className="text-lg font-bold mb-4">Disabled State</h3>
        <PlatformSelector
          credentials={mockCredentials}
          selectedCredentialId={selectedId}
          onSelect={setSelectedId}
          isDisabled={true}
        />
      </div>
    );
  },
};

export const Empty: Story = {
  render: function Render() {
    const [selectedId, setSelectedId] = useState('');

    return (
      <div className="max-w-2xl">
        <h3 className="text-lg font-bold mb-4">No Credentials</h3>
        <PlatformSelector
          credentials={[]}
          selectedCredentialId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
    );
  },
};

export const InFormContext: Story = {
  render: function Render() {
    const [selectedId, setSelectedId] = useState('cred-instagram-1');
    const [caption, setCaption] = useState('');

    return (
      <div className="max-w-2xl">
        <h3 className="text-lg font-bold mb-4">Create Post Form</h3>
        <form className="space-y-4">
          <div>
            <label className="block mb-2">
              <span className="text-sm font-medium">Platform Account</span>
            </label>
            <PlatformSelector
              credentials={mockCredentials}
              selectedCredentialId={selectedId}
              onSelect={setSelectedId}
            />
          </div>

          <div>
            <label className="block mb-2">
              <span className="text-sm font-medium">Caption</span>
            </label>
            <textarea
              className="w-full h-24 border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Enter post caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="h-9 px-4 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Create Post
          </button>
        </form>
      </div>
    );
  },
};
