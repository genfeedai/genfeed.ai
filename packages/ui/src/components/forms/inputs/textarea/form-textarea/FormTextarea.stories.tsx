import type { Meta, StoryObj } from '@storybook/nextjs';
import FormTextarea from '@ui/forms/inputs/textarea/form-textarea/FormTextarea';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

/**
 * FormTextarea component with auto-resize functionality.
 * Automatically adjusts height based on content.
 */
const meta = {
  argTypes: {
    isDisabled: {
      control: 'boolean',
      description: 'Disables textarea interaction',
    },
    isReadOnly: {
      control: 'boolean',
      description: 'Makes textarea read-only',
    },
    isRequired: {
      control: 'boolean',
      description: 'Marks textarea as required',
    },
    name: {
      control: 'text',
      description: 'Textarea name attribute',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
  },
  component: FormTextarea,
  decorators: [
    (Story) => (
      <div className="w-[600px]">
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'A textarea component that auto-resizes based on content. Integrates seamlessly with react-hook-form.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Forms/FormTextarea',
} satisfies Meta<typeof FormTextarea>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default textarea - auto-resizes as you type
 */
export const Default: Story = {
  args: {
    name: 'textarea',
  },
  render: () => {
    const { control } = useForm();

    return (
      <FormTextarea
        name="default"
        placeholder="Start typing... (auto-resizes)"
        control={control}
      />
    );
  },
};

/**
 * Textarea with placeholder
 */
export const WithPlaceholder: Story = {
  args: {
    name: 'textarea',
  },
  render: () => {
    const { control } = useForm();

    return (
      <FormTextarea
        name="description"
        placeholder="Describe your project in detail..."
        control={control}
      />
    );
  },
};

/**
 * Required textarea
 */
export const Required: Story = {
  args: {
    name: 'textarea',
  },
  render: () => {
    const { control } = useForm();

    return (
      <div>
        <label className="block mb-2">
          <span className="text-sm font-medium">
            Description <span className="text-error">*</span>
          </span>
        </label>
        <FormTextarea
          name="required"
          placeholder="This field is required"
          control={control}
          isRequired
        />
      </div>
    );
  },
};

/**
 * Disabled textarea
 */
export const Disabled: Story = {
  args: {
    name: 'textarea',
  },
  render: () => {
    const { control } = useForm({
      defaultValues: {
        disabled: 'This content cannot be edited',
      },
    });

    return <FormTextarea name="disabled" control={control} isDisabled />;
  },
};

/**
 * Read-only textarea
 */
export const ReadOnly: Story = {
  args: {
    name: 'textarea',
  },
  render: () => {
    const { control } = useForm({
      defaultValues: {
        readonly: 'This is read-only content\nYou can select but not edit it.',
      },
    });

    return <FormTextarea name="readonly" control={control} isReadOnly />;
  },
};

/**
 * Auto-resize demonstration
 */
export const AutoResize: Story = {
  args: {
    name: 'textarea',
  },
  render: () => {
    const { control } = useForm({
      defaultValues: {
        autoresize:
          'Try adding more lines...\nThe textarea will automatically expand!',
      },
    });

    return (
      <div className="space-y-2">
        <label className="block mb-2">
          <span className="text-sm font-medium">Auto-Resizing Textarea</span>
        </label>
        <FormTextarea
          name="autoresize"
          placeholder="Type multiple lines to see auto-resize in action"
          control={control}
        />
        <p className="text-sm text-foreground/70">
          Add or remove lines to see the textarea grow and shrink
        </p>
      </div>
    );
  },
};

/**
 * Long content example
 */
export const LongContent: Story = {
  args: {
    name: 'textarea',
  },
  render: () => {
    const { control } = useForm({
      defaultValues: {
        longcontent: `This is a longer piece of content that demonstrates how the textarea handles multiple lines.

The textarea will automatically adjust its height to fit all the content without requiring manual scrolling.

This makes it perfect for:
- Blog posts
- Descriptions
- Comments
- Notes
- Any multi-line text input

The component uses a ref to track the textarea and adjusts the height dynamically based on the scrollHeight.`,
      },
    });

    return <FormTextarea name="longcontent" control={control} />;
  },
};

/**
 * Form with multiple textareas
 */
export const FormExample: Story = {
  args: {
    name: 'textarea',
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const { control, handleSubmit } = useForm({
      defaultValues: {
        description: '',
        notes: '',
        title: '',
      },
    });

    const onSubmit = (_data: any) => {
      // Form submitted
    };

    return (
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block mb-2">
            <span className="text-sm font-medium">Title</span>
          </label>
          <FormTextarea
            name="title"
            placeholder="Enter a title..."
            control={control}
          />
        </div>

        <div>
          <label className="block mb-2">
            <span className="text-sm font-medium">
              Description <span className="text-error">*</span>
            </span>
          </label>
          <FormTextarea
            name="description"
            placeholder="Provide a detailed description..."
            control={control}
            isRequired
          />
        </div>

        <div>
          <label className="block mb-2">
            <span className="text-sm font-medium">Additional Notes</span>
          </label>
          <FormTextarea
            name="notes"
            placeholder="Any additional notes (optional)..."
            control={control}
          />
        </div>

        <button
          type="submit"
          className="h-9 px-4 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Submit
        </button>
      </form>
    );
  },
};

/**
 * With custom onChange handler
 */
export const WithOnChange: Story = {
  args: {
    name: 'textarea',
  },
  render: () => {
    const { control } = useForm();
    const [charCount, setCharCount] = useState(0);

    return (
      <div className="space-y-2">
        <label className="block mb-2">
          <span className="text-sm font-medium">Bio</span>
          <span className="text-xs text-muted-foreground">
            {charCount} / 500
          </span>
        </label>
        <FormTextarea
          name="bio"
          placeholder="Tell us about yourself..."
          control={control}
          onChange={(e) => setCharCount(e.target.value.length)}
        />
      </div>
    );
  },
};
