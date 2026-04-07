import type { Meta, StoryObj } from '@storybook/nextjs';
import FormToggle from '@ui/forms/selectors/toggle/form-toggle/FormToggle';
import type { ChangeEvent } from 'react';
import { useState } from 'react';

/**
 * FormToggle component for on/off switches.
 * Shows success color when checked, primary when unchecked.
 */
const meta = {
  argTypes: {
    description: {
      control: 'text',
      description: 'Optional description text',
    },
    isChecked: {
      control: 'boolean',
      description: 'Toggle checked state',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Disables toggle interaction',
    },
    label: {
      control: 'text',
      description: 'Toggle label text',
    },
  },
  component: FormToggle,
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'A toggle switch component with label and optional description. Changes color based on checked state.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Forms/FormToggle',
} satisfies Meta<typeof FormToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default toggle (unchecked)
 */
export const Default: Story = {
  args: {
    isChecked: false,
    label: 'Enable notifications',
  },
};

/**
 * Checked toggle (success color)
 */
export const Checked: Story = {
  args: {
    isChecked: true,
    label: 'Enable notifications',
  },
};

/**
 * Toggle with description
 */
export const WithDescription: Story = {
  args: {
    description: 'Receive email updates about your account activity',
    isChecked: false,
    label: 'Email notifications',
  },
};

/**
 * Checked with description
 */
export const CheckedWithDescription: Story = {
  args: {
    description: 'Use dark theme for better viewing at night',
    isChecked: true,
    label: 'Dark mode',
  },
};

/**
 * Disabled toggle (unchecked)
 */
export const Disabled: Story = {
  args: {
    description: 'Upgrade to Pro to unlock this feature',
    isChecked: false,
    isDisabled: true,
    label: 'Premium feature',
  },
};

/**
 * Disabled toggle (checked)
 */
export const DisabledChecked: Story = {
  args: {
    description: 'This setting is required and cannot be disabled',
    isChecked: true,
    isDisabled: true,
    label: 'Always enabled',
  },
};

/**
 * Interactive example with state
 */
export const Interactive: Story = {
  args: {
    isChecked: false,
  },
  render: () => {
    const [isEnabled, setIsEnabled] = useState(false);

    return (
      <div className="space-y-4">
        <FormToggle
          label="Feature enabled"
          description="Toggle this feature on or off"
          isChecked={isEnabled}
          onChange={(e) => setIsEnabled(e.target.checked)}
        />

        <div className="text-sm text-foreground/70">
          Status:{' '}
          <code className="bg-background px-2 py-1">
            {isEnabled ? 'ON' : 'OFF'}
          </code>
        </div>
      </div>
    );
  },
};

/**
 * Multiple toggles
 */
export const MultipleToggles: Story = {
  args: {
    isChecked: false,
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [settings, setSettings] = useState({
      analytics: false,
      autoSave: true,
      darkMode: false,
      notifications: true,
    });

    const updateSetting =
      (key: keyof typeof settings) => (e: ChangeEvent<HTMLInputElement>) => {
        setSettings((prev) => ({
          ...prev,
          [key]: e.target.checked,
        }));
      };

    return (
      <div className="space-y-4">
        <FormToggle
          label="Notifications"
          description="Receive push notifications"
          isChecked={settings.notifications}
          onChange={updateSetting('notifications')}
        />

        <FormToggle
          label="Dark mode"
          description="Use dark theme"
          isChecked={settings.darkMode}
          onChange={updateSetting('darkMode')}
        />

        <FormToggle
          label="Auto-save"
          description="Automatically save your work"
          isChecked={settings.autoSave}
          onChange={updateSetting('autoSave')}
        />

        <FormToggle
          label="Analytics"
          description="Help us improve with usage data"
          isChecked={settings.analytics}
          onChange={updateSetting('analytics')}
        />

        <div className="pt-4 border-t border-white/[0.08]">
          <pre className="text-xs bg-background p-3">
            {JSON.stringify(settings, null, 2)}
          </pre>
        </div>
      </div>
    );
  },
};

/**
 * Settings panel example
 */
export const SettingsPanel: Story = {
  args: {
    isChecked: false,
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [settings, setSettings] = useState({
      emailNotifications: true,
      marketingEmails: false,
      pushNotifications: false,
      securityAlerts: true,
      smsNotifications: false,
      weeklyDigest: true,
    });

    const updateSetting =
      (key: keyof typeof settings) => (e: ChangeEvent<HTMLInputElement>) => {
        setSettings((prev) => ({
          ...prev,
          [key]: e.target.checked,
        }));
      };

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">
            Notification Preferences
          </h3>
          <div className="space-y-4">
            <FormToggle
              label="Email notifications"
              description="Receive notifications via email"
              isChecked={settings.emailNotifications}
              onChange={updateSetting('emailNotifications')}
            />

            <FormToggle
              label="Push notifications"
              description="Receive browser push notifications"
              isChecked={settings.pushNotifications}
              onChange={updateSetting('pushNotifications')}
            />

            <FormToggle
              label="SMS notifications"
              description="Receive text messages for important updates"
              isChecked={settings.smsNotifications}
              onChange={updateSetting('smsNotifications')}
            />
          </div>
        </div>

        <div className="border-t border-white/[0.08] pt-6">
          <h3 className="text-lg font-semibold mb-4">Email Preferences</h3>
          <div className="space-y-4">
            <FormToggle
              label="Marketing emails"
              description="Receive updates about new features and promotions"
              isChecked={settings.marketingEmails}
              onChange={updateSetting('marketingEmails')}
            />

            <FormToggle
              label="Security alerts"
              description="Important notifications about account security"
              isChecked={settings.securityAlerts}
              onChange={updateSetting('securityAlerts')}
            />

            <FormToggle
              label="Weekly digest"
              description="Summary of your activity and updates"
              isChecked={settings.weeklyDigest}
              onChange={updateSetting('weeklyDigest')}
            />
          </div>
        </div>

        <div className="pt-4">
          <button className="h-8 px-3 text-sm font-black bg-primary text-primary-foreground hover:bg-primary/90">
            Save Preferences
          </button>
        </div>
      </div>
    );
  },
};

/**
 * Privacy settings example
 */
export const PrivacySettings: Story = {
  args: {
    isChecked: false,
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [privacy, setPrivacy] = useState({
      indexProfile: false,
      publicProfile: false,
      showActivity: true,
      showEmail: false,
    });

    const updatePrivacy =
      (key: keyof typeof privacy) => (e: ChangeEvent<HTMLInputElement>) => {
        setPrivacy((prev) => ({
          ...prev,
          [key]: e.target.checked,
        }));
      };

    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Privacy Settings</h3>

        <FormToggle
          label="Public profile"
          description="Make your profile visible to everyone"
          isChecked={privacy.publicProfile}
          onChange={updatePrivacy('publicProfile')}
        />

        <FormToggle
          label="Show email address"
          description="Display your email on your public profile"
          isChecked={privacy.showEmail}
          onChange={updatePrivacy('showEmail')}
          isDisabled={!privacy.publicProfile}
        />

        <FormToggle
          label="Show activity"
          description="Let others see your recent activity"
          isChecked={privacy.showActivity}
          onChange={updatePrivacy('showActivity')}
        />

        <FormToggle
          label="Allow search engine indexing"
          description="Let search engines find your profile"
          isChecked={privacy.indexProfile}
          onChange={updatePrivacy('indexProfile')}
          isDisabled={!privacy.publicProfile}
        />

        {!privacy.publicProfile && (
          <div className="text-sm text-foreground/70 bg-background p-3">
            Some options are disabled because your profile is private
          </div>
        )}
      </div>
    );
  },
};
