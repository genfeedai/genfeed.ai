import { PLATFORM_COLORS } from '@genfeedai/constants';
import { DropdownDirection, TagCategory } from '@genfeedai/enums';
import type { IBrand, IOrganization, ITag, IUser } from '@genfeedai/interfaces';
import type { Meta, StoryObj } from '@storybook/nextjs';
import DropdownTags from '@ui/tags/dropdown/DropdownTags';
import { useState } from 'react';

function createMockTag(id: string, label: string): ITag {
  return {
    backgroundColor: PLATFORM_COLORS.youtube.base,
    brand: {} as IBrand,
    category: TagCategory.INGREDIENT,
    createdAt: new Date().toISOString(),
    id,
    isDeleted: false,
    label,
    organization: {} as IOrganization,
    textColor: PLATFORM_COLORS.youtube.base,
    updatedAt: new Date().toISOString(),
    user: {} as IUser,
  };
}

/**
 * DropdownTags component provides a dropdown interface for selecting and managing tags.
 * Supports tag creation, search, and multi-selection.
 */
const meta = {
  argTypes: {
    direction: {
      control: 'select',
      description: 'Dropdown direction',
      options: ['up', 'down'],
    },
    isDisabled: {
      control: 'boolean',
      description: 'Disable the dropdown',
    },
    onChange: {
      action: 'tags changed',
      description: 'Callback when tags are selected/deselected',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
    scope: {
      control: 'select',
      description: 'Tag entity model scope',
      options: Object.values(TagCategory),
    },
    selectedTags: {
      control: 'object',
      description: 'Array of selected tag IDs',
    },
    showLabel: {
      control: 'boolean',
      description: 'Show label on button',
    },
  },
  component: DropdownTags,
  parameters: {
    docs: {
      description: {
        component:
          'Dropdown component for selecting and managing tags with search and create functionality.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Tags/DropdownTags',
} satisfies Meta<typeof DropdownTags>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default tag dropdown
 */
export const Default: Story = {
  args: {
    direction: DropdownDirection.DOWN,
    externalTags: [
      createMockTag('1', 'React'),
      createMockTag('2', 'TypeScript'),
      createMockTag('3', 'Next.js'),
    ],
    isDisabled: false,
    isLoadingTags: false,
    onChange: () => {
      // Tags changed
    },
    placeholder: 'Tags',
    scope: TagCategory.INGREDIENT,
    selectedTags: [],
    showLabel: true,
  },
};

/**
 * With selected tags
 */
export const WithSelectedTags: Story = {
  args: {
    direction: DropdownDirection.DOWN,
    externalTags: [
      createMockTag('1', 'React'),
      createMockTag('2', 'TypeScript'),
      createMockTag('3', 'Next.js'),
    ],
    isDisabled: false,
    isLoadingTags: false,
    onChange: () => {
      // Tags changed
    },
    placeholder: 'Tags',
    scope: TagCategory.INGREDIENT,
    selectedTags: ['1', '2'],
    showLabel: true,
  },
};

/**
 * Without label (icon only)
 */
export const IconOnly: Story = {
  args: {
    direction: DropdownDirection.DOWN,
    externalTags: [
      createMockTag('1', 'React'),
      createMockTag('2', 'TypeScript'),
    ],
    isDisabled: false,
    isLoadingTags: false,
    onChange: () => {
      // Tags changed
    },
    placeholder: 'Tags',
    scope: TagCategory.INGREDIENT,
    selectedTags: ['1'],
    showLabel: false,
  },
};

/**
 * Disabled state
 */
export const Disabled: Story = {
  args: {
    direction: DropdownDirection.DOWN,
    externalTags: [createMockTag('1', 'React')],
    isDisabled: true,
    isLoadingTags: false,
    onChange: () => {
      // Tags changed
    },
    placeholder: 'Tags',
    scope: TagCategory.INGREDIENT,
    selectedTags: ['1'],
    showLabel: true,
  },
};

/**
 * Loading state
 */
export const Loading: Story = {
  args: {
    direction: DropdownDirection.DOWN,
    externalTags: [],
    isDisabled: false,
    isLoadingTags: true,
    onChange: () => {
      // Tags changed
    },
    placeholder: 'Tags',
    scope: TagCategory.INGREDIENT,
    selectedTags: [],
    showLabel: true,
  },
};

/**
 * Interactive example
 */
export const Interactive: Story = {
  args: {
    direction: DropdownDirection.DOWN,
    isDisabled: false,
    onChange: () => {
      // Tags changed
    },
    placeholder: 'Tags',
    scope: TagCategory.INGREDIENT,
    selectedTags: [],
    showLabel: true,
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    return (
      <div className="p-8">
        <DropdownTags
          selectedTags={selectedTags}
          onChange={setSelectedTags}
          scope={TagCategory.INGREDIENT}
          placeholder="Tags"
          externalTags={[
            createMockTag('1', 'React'),
            createMockTag('2', 'TypeScript'),
            createMockTag('3', 'Next.js'),
            createMockTag('4', 'Storybook'),
            createMockTag('5', 'Tailwind'),
          ]}
          isLoadingTags={false}
        />
        <div className="mt-4 text-sm text-gray-600">
          Selected: {selectedTags.join(', ') || 'None'}
        </div>
      </div>
    );
  },
};
