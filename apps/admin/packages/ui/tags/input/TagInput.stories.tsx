import type { ITag } from '@genfeedai/interfaces';
import { PLATFORM_COLORS } from '@genfeedai/constants';
import type { Meta, StoryObj } from '@storybook/nextjs';
import TagInput from '@ui/tags/input/TagInput';
import { useState } from 'react';

/**
 * TagInput component allows users to add and remove tags.
 * Supports keyboard interaction (Enter to add) and displays existing tags.
 */
const meta = {
  argTypes: {
    isDisabled: {
      control: 'boolean',
      description: 'Disable the input and tag removal',
    },
    onAddTag: {
      action: 'tag added',
      description: 'Callback when a new tag is added',
    },
    onRemoveTag: {
      action: 'tag removed',
      description: 'Callback when a tag is removed',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder text for the input',
    },
    tags: {
      control: 'object',
      description: 'Array of tag objects',
    },
  },
  component: TagInput,
  parameters: {
    docs: {
      description: {
        component:
          'An input component for managing tags with add/remove functionality. Press Enter to add tags.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Tags/TagInput',
} satisfies Meta<typeof TagInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default tag input with empty state
 */
export const Default: Story = {
  args: {
    isDisabled: false,
    onAddTag: async () => {
      // Tag added
    },
    onRemoveTag: () => {
      // Tag removed
    },
    placeholder: 'Add tags...',
    tags: [],
  },
};

/**
 * Tag input with existing tags
 */
export const WithTags: Story = {
  args: {
    isDisabled: false,
    onAddTag: async () => {
      // Tag added
    },
    onRemoveTag: () => {
      // Tag removed
    },
    placeholder: 'Add tags...',
    tags: [
      {
        backgroundColor: PLATFORM_COLORS.youtube.base,
        id: '1',
        label: 'React',
        textColor: PLATFORM_COLORS.youtube.base,
      } as ITag,
      {
        backgroundColor: PLATFORM_COLORS.youtube.base,
        id: '2',
        label: 'TypeScript',
        textColor: PLATFORM_COLORS.youtube.base,
      } as ITag,
      {
        backgroundColor: PLATFORM_COLORS.youtube.base,
        id: '3',
        label: 'Next.js',
        textColor: PLATFORM_COLORS.youtube.base,
      } as ITag,
    ] as any,
  },
};

/**
 * Disabled tag input
 */
export const Disabled: Story = {
  args: {
    isDisabled: true,
    onAddTag: async () => {
      // Tag added
    },
    onRemoveTag: () => {
      // Tag removed
    },
    placeholder: 'Add tags...',
    tags: [
      {
        backgroundColor: PLATFORM_COLORS.youtube.base,
        id: '1',
        label: 'React',
        textColor: PLATFORM_COLORS.youtube.base,
      } as ITag,
      {
        backgroundColor: PLATFORM_COLORS.youtube.base,
        id: '2',
        label: 'TypeScript',
        textColor: PLATFORM_COLORS.youtube.base,
      } as ITag,
    ] as any,
  },
};

/**
 * Custom placeholder
 */
export const CustomPlaceholder: Story = {
  args: {
    isDisabled: false,
    onAddTag: async () => {
      // Tag added
    },
    onRemoveTag: () => {
      // Tag removed
    },
    placeholder: 'Enter tags and press Enter...',
    tags: [],
  },
};

/**
 * Interactive example with state management
 */
export const Interactive: Story = {
  args: {} as any,
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [tags, setTags] = useState([
      {
        backgroundColor: PLATFORM_COLORS.youtube.base,
        id: '1',
        label: 'React',
        textColor: PLATFORM_COLORS.youtube.base,
      } as ITag,
      {
        backgroundColor: PLATFORM_COLORS.youtube.base,
        id: '2',
        label: 'TypeScript',
        textColor: PLATFORM_COLORS.youtube.base,
      } as ITag,
    ]);

    const handleAddTag = async () => {
      const newTag = {
        backgroundColor: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
        id: Date.now().toString(),
        label: 'New Tag',
        textColor: '#ffffff',
      } as any;
      setTags([...tags, newTag]);
    };

    const handleRemoveTag = (tagId: string) => {
      setTags(tags.filter((tag) => tag.id !== tagId));
    };

    return (
      <div className="w-full max-w-md p-8">
        <TagInput
          tags={tags}
          placeholder="Add tags..."
          onAddTag={handleAddTag}
          onRemoveTag={handleRemoveTag}
        />
      </div>
    );
  },
};

/**
 * Many tags example
 */
export const ManyTags: Story = {
  args: {
    isDisabled: false,
    onAddTag: async () => {
      // Tag added
    },
    onRemoveTag: () => {
      // Tag removed
    },
    placeholder: 'Add tags...',
    tags: [
      {
        backgroundColor: PLATFORM_COLORS.youtube.base,
        id: '1',
        label: 'React',
        textColor: PLATFORM_COLORS.youtube.base,
      } as ITag,
      {
        backgroundColor: PLATFORM_COLORS.youtube.base,
        id: '2',
        label: 'TypeScript',
        textColor: PLATFORM_COLORS.youtube.base,
      } as ITag,
      {
        backgroundColor: PLATFORM_COLORS.youtube.base,
        id: '3',
        label: 'Next.js',
        textColor: PLATFORM_COLORS.youtube.base,
      } as ITag,
      {
        backgroundColor: PLATFORM_COLORS.youtube.base,
        id: '4',
        label: 'Storybook',
        textColor: PLATFORM_COLORS.youtube.base,
      } as ITag,
      {
        backgroundColor: PLATFORM_COLORS.youtube.base,
        id: '5',
        label: 'Tailwind CSS',
        textColor: PLATFORM_COLORS.youtube.base,
      } as ITag,
      {
        backgroundColor: PLATFORM_COLORS.youtube.base,
        id: '6',
        label: 'Jest',
        textColor: PLATFORM_COLORS.youtube.base,
      } as ITag,
      {
        backgroundColor: PLATFORM_COLORS.youtube.base,
        id: '7',
        label: 'Testing Library',
        textColor: PLATFORM_COLORS.youtube.base,
      } as ITag,
    ] as any,
  },
  parameters: {
    layout: 'padded',
  },
};
