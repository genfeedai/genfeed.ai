import type { Meta, StoryObj } from '@storybook/nextjs';
import FolderCard from '@ui/folders/card/FolderCard';

/**
 * FolderCard component displays a folder with icon, label, and optional description.
 * Used for folder navigation and selection.
 */
const meta = {
  argTypes: {
    folder: {
      control: 'object',
      description: 'Folder object with label, description, and id',
    } as any,
    onClick: {
      action: 'clicked',
      description: 'Callback when folder card is clicked',
    },
  },
  component: FolderCard,
  parameters: {
    docs: {
      description: {
        component:
          'Card component for displaying folders with icon, label, and optional description.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Folders/FolderCard',
} satisfies Meta<typeof FolderCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default folder card
 */
export const Default: Story = {
  args: {
    folder: {
      description: 'Personal video collection',
      id: '1',
      label: 'My Videos',
    } as any,
    onClick: (_folder) => {
      // Folder clicked
    },
  },
};

/**
 * Folder card without description
 */
export const NoDescription: Story = {
  args: {
    folder: {
      id: '2',
      label: 'Projects',
    } as any,
    onClick: (_folder) => {
      // Folder clicked
    },
  },
};

/**
 * Folder card with long label
 */
export const LongLabel: Story = {
  args: {
    folder: {
      description: 'This folder has a very long name',
      id: '3',
      label: 'Very Long Folder Name That Might Get Truncated',
    } as any,
    onClick: (_folder) => {
      // Folder clicked
    },
  },
};

/**
 * Folder card grid layout
 */
export const Grid: Story = {
  args: { folder: { id: '1', label: 'Folder' } as any, onClick: () => {} },
  parameters: {
    layout: 'fullscreen',
  },
  render: () => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-8 w-full max-w-4xl">
      <FolderCard
        folder={
          { description: 'Video collection', id: '1', label: 'Videos' } as any
        }
        onClick={(_f) => {
          // Folder clicked
        }}
      />
      <FolderCard
        folder={
          { description: 'Image gallery', id: '2', label: 'Images' } as any
        }
        onClick={(_f) => {
          // Folder clicked
        }}
      />
      <FolderCard
        folder={{ description: 'Sound files', id: '3', label: 'Audio' } as any}
        onClick={(_f) => {
          // Folder clicked
        }}
      />
      <FolderCard
        folder={{ id: '4', label: 'Projects' } as any}
        onClick={(_f) => {
          // Folder clicked
        }}
      />
      <FolderCard
        folder={
          {
            description: 'Reusable templates',
            id: '5',
            label: 'Templates',
          } as any
        }
        onClick={(_f) => {
          // Folder clicked
        }}
      />
      <FolderCard
        folder={{ description: 'Old files', id: '6', label: 'Archive' } as any}
        onClick={(_f) => {
          // Folder clicked
        }}
      />
    </div>
  ),
};
