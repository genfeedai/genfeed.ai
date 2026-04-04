import type { Meta, StoryObj } from '@storybook/nextjs';
import FormCheckbox from '@ui/forms/selectors/checkbox/form-checkbox/FormCheckbox';
import type { ChangeEvent } from 'react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

/**
 * FormCheckbox component for checkbox inputs.
 * Supports labels, react-hook-form integration, and custom styling.
 */
const meta = {
  argTypes: {
    isChecked: {
      control: 'boolean',
      description: 'Checkbox checked state',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Disables checkbox interaction',
    },
    isRequired: {
      control: 'boolean',
      description: 'Marks checkbox as required',
    },
    label: {
      control: 'text',
      description: 'Optional label text',
    },
    name: {
      control: 'text',
      description: 'Checkbox name attribute',
    },
  },
  component: FormCheckbox,
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
          'A checkbox component with optional label support and react-hook-form integration.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Forms/FormCheckbox',
} satisfies Meta<typeof FormCheckbox>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default checkbox without label
 */
export const Default: Story = {
  args: {
    isChecked: false,
    name: 'default',
  },
};

/**
 * Checked checkbox
 */
export const Checked: Story = {
  args: {
    isChecked: true,
    name: 'checked',
  },
};

/**
 * Checkbox with label
 */
export const WithLabel: Story = {
  args: {
    isChecked: false,
    label: 'I agree to the terms and conditions',
    name: 'terms',
  },
};

/**
 * Checked with label
 */
export const CheckedWithLabel: Story = {
  args: {
    isChecked: true,
    label: 'Subscribe to newsletter',
    name: 'newsletter',
  },
};

/**
 * Disabled checkbox
 */
export const Disabled: Story = {
  args: {
    isChecked: false,
    isDisabled: true,
    label: 'This option is disabled',
    name: 'disabled',
  },
};

/**
 * Disabled and checked
 */
export const DisabledChecked: Story = {
  args: {
    isChecked: true,
    isDisabled: true,
    label: 'This option is always enabled',
    name: 'disabledChecked',
  },
};

/**
 * Required checkbox
 */
export const Required: Story = {
  args: {
    isChecked: false,
    isRequired: true,
    label: 'You must accept this',
    name: 'required',
  },
};

/**
 * Interactive example with state
 */
export const Interactive: Story = {
  args: {
    name: 'checkbox',
  },
  render: () => {
    const [isChecked, setIsChecked] = useState(false);

    return (
      <div className="space-y-4">
        <FormCheckbox
          name="interactive"
          label="Toggle me"
          isChecked={isChecked}
          onChange={(e) => setIsChecked(e.target.checked)}
        />

        <div className="text-sm text-foreground/70">
          Status:{' '}
          <code className="bg-background px-2 py-1">
            {isChecked ? 'Checked' : 'Unchecked'}
          </code>
        </div>
      </div>
    );
  },
};

/**
 * Multiple checkboxes
 */
export const MultipleCheckboxes: Story = {
  args: {
    name: 'checkbox',
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [selections, setSelections] = useState({
      css: true,
      html: true,
      javascript: false,
      react: false,
      typescript: false,
    });

    const handleChange =
      (key: keyof typeof selections) => (e: ChangeEvent<HTMLInputElement>) => {
        setSelections((prev) => ({
          ...prev,
          [key]: e.target.checked,
        }));
      };

    return (
      <div className="space-y-4">
        <h4 className="font-semibold">Select your skills:</h4>

        <div className="space-y-3">
          <FormCheckbox
            name="html"
            label="HTML"
            isChecked={selections.html}
            onChange={handleChange('html')}
          />
          <FormCheckbox
            name="css"
            label="CSS"
            isChecked={selections.css}
            onChange={handleChange('css')}
          />
          <FormCheckbox
            name="javascript"
            label="JavaScript"
            isChecked={selections.javascript}
            onChange={handleChange('javascript')}
          />
          <FormCheckbox
            name="typescript"
            label="TypeScript"
            isChecked={selections.typescript}
            onChange={handleChange('typescript')}
          />
          <FormCheckbox
            name="react"
            label="React"
            isChecked={selections.react}
            onChange={handleChange('react')}
          />
        </div>

        <div className="pt-4 border-t border-white/[0.08]">
          <div className="text-sm text-foreground/70">
            Selected:{' '}
            {Object.entries(selections)
              .filter(([_, v]) => v)
              .map(([k]) => k)
              .join(', ') || 'None'}
          </div>
        </div>
      </div>
    );
  },
};

/**
 * React Hook Form integration
 */
export const WithReactHookForm: Story = {
  args: {
    name: 'checkbox',
  },
  render: () => {
    const { control, handleSubmit, watch } = useForm({
      defaultValues: {
        acceptTerms: false,
        subscribe: false,
      },
    });

    const values = watch();

    const onSubmit = (_data: any) => {
      // Form submitted
      alert('Check console for form data');
    };

    return (
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormCheckbox
          name="acceptTerms"
          label="I accept the terms and conditions"
          control={control}
          isRequired
        />

        <FormCheckbox
          name="subscribe"
          label="Send me occasional updates and promotions"
          control={control}
        />

        <div className="pt-4 border-t border-white/[0.08] space-y-2">
          <div className="text-sm text-foreground/70">
            <pre className="bg-background p-3 text-xs">
              {JSON.stringify(values, null, 2)}
            </pre>
          </div>

          <button
            type="submit"
            className="h-8 px-3 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!values.acceptTerms}
          >
            Submit
          </button>
        </div>
      </form>
    );
  },
};

/**
 * Checkbox list example
 */
export const CheckboxList: Story = {
  args: {
    name: 'checkbox',
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [features, setFeatures] = useState({
      analytics: true,
      api: false,
      collaboration: true,
      customBranding: false,
      exports: false,
      support: true,
    });

    const handleChange =
      (key: keyof typeof features) => (e: ChangeEvent<HTMLInputElement>) => {
        setFeatures((prev) => ({
          ...prev,
          [key]: e.target.checked,
        }));
      };

    const selectedCount = Object.values(features).filter(Boolean).length;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold">Choose features</h4>
          <span className="text-sm text-foreground/70">
            {selectedCount} selected
          </span>
        </div>

        <div className="space-y-3 bg-background p-4">
          <FormCheckbox
            name="analytics"
            label="Advanced Analytics"
            isChecked={features.analytics}
            onChange={handleChange('analytics')}
          />
          <FormCheckbox
            name="exports"
            label="Data Exports"
            isChecked={features.exports}
            onChange={handleChange('exports')}
          />
          <FormCheckbox
            name="collaboration"
            label="Team Collaboration"
            isChecked={features.collaboration}
            onChange={handleChange('collaboration')}
          />
          <FormCheckbox
            name="api"
            label="API Access"
            isChecked={features.api}
            onChange={handleChange('api')}
          />
          <FormCheckbox
            name="customBranding"
            label="Custom Branding"
            isChecked={features.customBranding}
            onChange={handleChange('customBranding')}
          />
          <FormCheckbox
            name="support"
            label="Priority Support"
            isChecked={features.support}
            onChange={handleChange('support')}
          />
        </div>

        <button className="h-8 px-3 text-sm font-black bg-primary text-primary-foreground hover:bg-primary/90">
          Continue with {selectedCount} features
        </button>
      </div>
    );
  },
};

/**
 * Terms and conditions example
 */
export const TermsAndConditions: Story = {
  args: {
    name: 'checkbox',
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [accepted, setAccepted] = useState({
      age: false,
      privacy: false,
      terms: false,
    });

    const handleChange =
      (key: keyof typeof accepted) => (e: ChangeEvent<HTMLInputElement>) => {
        setAccepted((prev) => ({
          ...prev,
          [key]: e.target.checked,
        }));
      };

    const allAccepted = Object.values(accepted).every(Boolean);

    return (
      <div className="space-y-4">
        <h4 className="font-semibold">Before you continue</h4>

        <div className="space-y-3">
          <FormCheckbox
            name="terms"
            label="I agree to the Terms of Service"
            isChecked={accepted.terms}
            onChange={handleChange('terms')}
            isRequired
          />
          <FormCheckbox
            name="privacy"
            label="I agree to the Privacy Policy"
            isChecked={accepted.privacy}
            onChange={handleChange('privacy')}
            isRequired
          />
          <FormCheckbox
            name="age"
            label="I confirm that I am 18 years or older"
            isChecked={accepted.age}
            onChange={handleChange('age')}
            isRequired
          />
        </div>

        <button
          className="h-9 px-4 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!allAccepted}
        >
          Create Account
        </button>

        {!allAccepted && (
          <p className="text-sm text-error">
            Please accept all required terms to continue
          </p>
        )}
      </div>
    );
  },
};

/**
 * Grouped checkboxes example
 */
export const GroupedCheckboxes: Story = {
  args: {
    name: 'checkbox',
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [notifications, setNotifications] = useState({
      email: {
        comments: true,
        followers: false,
        mentions: true,
      },
      push: {
        comments: false,
        followers: false,
        mentions: true,
      },
    });

    const handleEmailChange =
      (key: keyof typeof notifications.email) =>
      (e: ChangeEvent<HTMLInputElement>) => {
        setNotifications((prev) => ({
          ...prev,
          email: {
            ...prev.email,
            [key]: e.target.checked,
          },
        }));
      };

    const handlePushChange =
      (key: keyof typeof notifications.push) =>
      (e: ChangeEvent<HTMLInputElement>) => {
        setNotifications((prev) => ({
          ...prev,
          push: {
            ...prev.push,
            [key]: e.target.checked,
          },
        }));
      };

    return (
      <div className="space-y-6">
        <div>
          <h4 className="font-semibold mb-3">Email Notifications</h4>
          <div className="space-y-2 pl-4">
            <FormCheckbox
              name="email-comments"
              label="Comments on your posts"
              isChecked={notifications.email.comments}
              onChange={handleEmailChange('comments')}
            />
            <FormCheckbox
              name="email-mentions"
              label="Mentions in comments"
              isChecked={notifications.email.mentions}
              onChange={handleEmailChange('mentions')}
            />
            <FormCheckbox
              name="email-followers"
              label="New followers"
              isChecked={notifications.email.followers}
              onChange={handleEmailChange('followers')}
            />
          </div>
        </div>

        <div>
          <h4 className="font-semibold mb-3">Push Notifications</h4>
          <div className="space-y-2 pl-4">
            <FormCheckbox
              name="push-comments"
              label="Comments on your posts"
              isChecked={notifications.push.comments}
              onChange={handlePushChange('comments')}
            />
            <FormCheckbox
              name="push-mentions"
              label="Mentions in comments"
              isChecked={notifications.push.mentions}
              onChange={handlePushChange('mentions')}
            />
            <FormCheckbox
              name="push-followers"
              label="New followers"
              isChecked={notifications.push.followers}
              onChange={handlePushChange('followers')}
            />
          </div>
        </div>
      </div>
    );
  },
};
