import { PLATFORM_COLORS } from '@genfeedai/constants';
import { ComponentSize } from '@genfeedai/enums';
import type { Meta, StoryObj } from '@storybook/nextjs';
import TagBadge from '@ui/tags/badge/TagBadge';
import { useState } from 'react';

/**
 * TagBadge component displays a tag with optional remove functionality.
 * Supports custom colors, sizes, and removal handlers.
 */
const meta = {
  argTypes: {
    isRemovable: {
      control: 'boolean',
      description: 'Show remove button on the tag',
    },
    onRemove: {
      action: 'removed',
      description: 'Callback when tag is removed',
    },
    size: {
      control: 'select',
      description: 'Size variant of the tag badge',
      options: ['sm', 'md', 'lg'],
    },
    tag: {
      control: 'object',
      description:
        'Tag object with label, id, backgroundColor, textColor, and description',
    } as any,
  },
  component: TagBadge,
  parameters: {
    docs: {
      description: {
        component:
          'A badge component for displaying tags with customizable colors, sizes, and optional removal functionality.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Tags/TagBadge',
} satisfies Meta<typeof TagBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default tag badge with small size
 */
export const Default: Story = {
  args: {
    isRemovable: false,
    size: ComponentSize.SM,
    tag: {
      backgroundColor: PLATFORM_COLORS.youtube.base,
      id: '1',
      textColor: PLATFORM_COLORS.youtube.base,
    } as any,
  },
};

/**
 * Medium size tag badge
 */
export const Medium: Story = {
  args: {
    isRemovable: false,
    size: ComponentSize.MD,
    tag: {
      backgroundColor: PLATFORM_COLORS.youtube.base,
      id: '2',
      textColor: PLATFORM_COLORS.youtube.base,
    } as any,
  },
};

/**
 * Large size tag badge
 */
export const Large: Story = {
  args: {
    isRemovable: false,
    size: ComponentSize.LG,
    tag: {
      backgroundColor: PLATFORM_COLORS.youtube.base,
      id: '3',
      textColor: PLATFORM_COLORS.youtube.base,
    } as any,
  },
};

/**
 * Removable tag badge
 */
export const Removable: Story = {
  args: {
    isRemovable: true,
    size: ComponentSize.MD,
    tag: {
      backgroundColor: PLATFORM_COLORS.youtube.base,
      id: '4',
      textColor: PLATFORM_COLORS.youtube.base,
    } as any,
  },
};

/**
 * Tag with description (shown in tooltip)
 */
export const WithDescription: Story = {
  args: {
    isRemovable: false,
    size: ComponentSize.MD,
    tag: {
      backgroundColor: PLATFORM_COLORS.youtube.base,
      description: 'Tool for building UI components',
      id: '5',
      textColor: PLATFORM_COLORS.youtube.base,
    } as any,
  },
};

/**
 * Various color examples
 */
export const ColorVariants: Story = {
  args: {} as any,
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <div className="flex flex-wrap gap-2 p-8">
      <TagBadge
        tag={
          {
            backgroundColor: PLATFORM_COLORS.youtube.base,
            id: '1',
            textColor: PLATFORM_COLORS.youtube.base,
          } as any
        }
        size={ComponentSize.MD}
      />
      <TagBadge
        tag={
          {
            backgroundColor: PLATFORM_COLORS.youtube.base,
            id: '2',
            textColor: PLATFORM_COLORS.youtube.base,
          } as any
        }
        size={ComponentSize.MD}
      />
      <TagBadge
        tag={
          {
            backgroundColor: PLATFORM_COLORS.youtube.base,
            id: '3',
            textColor: PLATFORM_COLORS.youtube.base,
          } as any
        }
        size={ComponentSize.MD}
      />
      <TagBadge
        tag={
          {
            backgroundColor: PLATFORM_COLORS.youtube.base,
            id: '4',
            textColor: PLATFORM_COLORS.youtube.base,
          } as any
        }
        size={ComponentSize.MD}
      />
      <TagBadge
        tag={
          {
            backgroundColor: PLATFORM_COLORS.youtube.base,
            id: '5',
            textColor: PLATFORM_COLORS.youtube.base,
          } as any
        }
        size={ComponentSize.MD}
      />
      <TagBadge
        tag={
          {
            backgroundColor: PLATFORM_COLORS.youtube.base,
            id: '6',
            textColor: PLATFORM_COLORS.youtube.base,
          } as any
        }
        size={ComponentSize.MD}
      />
    </div>
  ),
};

/**
 * All sizes comparison
 */
export const SizeComparison: Story = {
  args: {} as any,
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <div className="flex flex-col gap-4 p-8">
      <div className="flex items-center gap-4">
        <span className="w-20 text-sm">Small:</span>
        <TagBadge
          tag={
            {
              backgroundColor: PLATFORM_COLORS.youtube.base,
              id: '1',
              textColor: PLATFORM_COLORS.youtube.base,
            } as any
          }
          size={ComponentSize.SM}
        />
      </div>
      <div className="flex items-center gap-4">
        <span className="w-20 text-sm">Medium:</span>
        <TagBadge
          tag={
            {
              backgroundColor: PLATFORM_COLORS.youtube.base,
              id: '2',
              textColor: PLATFORM_COLORS.youtube.base,
            } as any
          }
          size={ComponentSize.MD}
        />
      </div>
      <div className="flex items-center gap-4">
        <span className="w-20 text-sm">Large:</span>
        <TagBadge
          tag={
            {
              backgroundColor: PLATFORM_COLORS.youtube.base,
              id: '3',
              textColor: PLATFORM_COLORS.youtube.base,
            } as any
          }
          size={ComponentSize.LG}
        />
      </div>
    </div>
  ),
};

/**
 * Interactive example with removal
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
        textColor: PLATFORM_COLORS.youtube.base,
      } as any,
      {
        backgroundColor: PLATFORM_COLORS.youtube.base,
        id: '2',
        textColor: PLATFORM_COLORS.youtube.base,
      } as any,
      {
        backgroundColor: PLATFORM_COLORS.youtube.base,
        id: '3',
        textColor: PLATFORM_COLORS.youtube.base,
      } as any,
      {
        backgroundColor: PLATFORM_COLORS.youtube.base,
        id: '4',
        textColor: PLATFORM_COLORS.youtube.base,
      } as any,
    ]);

    const handleRemove = (id: string) => {
      setTags(tags.filter((tag) => tag.id !== id));
    };

    return (
      <div className="space-y-4 p-8">
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <TagBadge
              key={tag.id}
              tag={tag}
              size={ComponentSize.MD}
              isRemovable
              onRemove={handleRemove}
            />
          ))}
        </div>
        {tags.length === 0 && (
          <p className="text-sm text-gray-500">All tags removed!</p>
        )}
      </div>
    );
  },
};

/**
 * Long label tag (truncated)
 */
export const LongLabel: Story = {
  args: {
    isRemovable: false,
    size: ComponentSize.MD,
    tag: {
      backgroundColor: PLATFORM_COLORS.youtube.base,
      id: '6',
      textColor: PLATFORM_COLORS.youtube.base,
    } as any,
  },
};
