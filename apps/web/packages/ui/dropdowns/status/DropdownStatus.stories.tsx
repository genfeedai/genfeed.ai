import { ArticleStatus, IngredientStatus } from '@genfeedai/enums';
import type { Meta, StoryObj } from '@storybook/nextjs';
import DropdownStatus from '@ui/dropdowns/status/DropdownStatus';

/**
 * DropdownStatus component allows users to change the status of an item
 * (completed, validated, archived, etc.) with inline editing.
 */
const meta = {
  argTypes: {
    entity: {
      control: 'object',
      description:
        'Item object (article, ingredient, or post) with status property',
    },
    onStatusChange: {
      action: 'status changed',
      description: 'Callback when status is updated',
    },
  },
  component: DropdownStatus,
  parameters: {
    docs: {
      description: {
        component:
          'Dropdown for changing item status (completed, validated, archived, etc.).',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Dropdowns/DropdownStatus',
} satisfies Meta<typeof DropdownStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Completed status
 */
export const Completed: Story = {
  args: {
    entity: {
      id: '1',
      status: IngredientStatus.GENERATED,
    },
    onStatusChange: async () => {
      // Status changed
    },
  },
};

/**
 * Validated status
 */
export const Validated: Story = {
  args: {
    entity: {
      id: '2',
      status: IngredientStatus.VALIDATED,
    },
    onStatusChange: async () => {
      // Status changed
    },
  },
};

/**
 * Archived status
 */
export const Archived: Story = {
  args: {
    entity: {
      id: '3',
      status: IngredientStatus.ARCHIVED,
    },
    onStatusChange: async () => {
      // Status changed
    },
  },
};

/**
 * Processing status (shows only Failed option)
 */
export const Processing: Story = {
  args: {
    entity: {
      id: '4',
      status: IngredientStatus.PROCESSING,
    },
    onStatusChange: async () => {
      // Status changed
    },
  },
};

/**
 * Failed status (disabled)
 */
export const Failed: Story = {
  args: {
    entity: {
      id: '5',
      status: IngredientStatus.FAILED,
    },
    onStatusChange: async () => {
      // Status changed
    },
  },
};

/**
 * Article draft status
 */
export const ArticleDraft: Story = {
  args: {
    entity: {
      id: '6',
      readingTime: 5,
      slug: 'test-article',
      status: ArticleStatus.DRAFT,
    },
    onStatusChange: async () => {
      // Status changed
    },
  },
};

/**
 * Article published status
 */
export const ArticlePublished: Story = {
  args: {
    entity: {
      id: '7',
      readingTime: 5,
      slug: 'test-article',
      status: ArticleStatus.PUBLIC,
    },
    onStatusChange: async () => {
      // Status changed
    },
  },
};
