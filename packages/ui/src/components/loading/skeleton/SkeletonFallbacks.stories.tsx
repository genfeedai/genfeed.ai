import type { Meta, StoryObj } from '@storybook/nextjs';
import { SkeletonLoadingFallback } from '@ui/loading/skeleton/SkeletonFallbacks';

/**
 * SkeletonLoadingFallback component displays various skeleton loading states
 * for different content types (masonry, video grid, brands, table, analytics, etc.).
 */
const meta = {
  argTypes: {
    columns: {
      control: 'number',
      description: 'Number of table columns (for table type)',
    },
    count: {
      control: 'number',
      description: 'Number of skeleton items to display',
    },
    rows: {
      control: 'number',
      description: 'Number of table rows (for table type)',
    },
    type: {
      control: 'select',
      description: 'Type of skeleton layout',
      options: [
        'masonry',
        'videoGrid',
        'brands',
        'table',
        'analytics',
        'gallery',
        'settings',
      ],
    },
  },
  component: SkeletonLoadingFallback,
  parameters: {
    docs: {
      description: {
        component:
          'Skeleton loading fallback component with multiple type variants for different content layouts.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Loading/SkeletonFallbacks',
} satisfies Meta<typeof SkeletonLoadingFallback>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Masonry grid skeleton
 */
export const Masonry: Story = {
  args: {
    count: 12,
    type: 'masonry',
  },
  parameters: {
    layout: 'fullscreen',
  },
};

/**
 * Video grid skeleton
 */
export const VideoGrid: Story = {
  args: {
    count: 8,
    type: 'videoGrid',
  },
  parameters: {
    layout: 'fullscreen',
  },
};

/**
 * Brands list skeleton
 */
export const Brands: Story = {
  args: {
    count: 6,
    type: 'brands',
  },
  parameters: {
    layout: 'fullscreen',
  },
};

/**
 * Table skeleton
 */
export const Table: Story = {
  args: {
    columns: 5,
    rows: 8,
    type: 'table',
  },
  parameters: {
    layout: 'fullscreen',
  },
};

/**
 * Analytics dashboard skeleton
 */
export const Analytics: Story = {
  args: {
    type: 'analytics',
  },
  parameters: {
    layout: 'fullscreen',
  },
};

/**
 * Gallery skeleton
 */
export const Gallery: Story = {
  args: {
    count: 12,
    type: 'gallery',
  },
  parameters: {
    layout: 'fullscreen',
  },
};

/**
 * Settings skeleton
 */
export const Settings: Story = {
  args: {
    count: 3,
    type: 'settings',
  },
  parameters: {
    layout: 'fullscreen',
  },
};

/**
 * All types comparison
 */
export const AllTypes: Story = {
  parameters: {
    layout: 'fullscreen',
  },
  render: () => (
    <div className="space-y-12 p-8">
      <div>
        <h3 className="text-lg font-semibold mb-4">Masonry</h3>
        <SkeletonLoadingFallback type="masonry" count={6} />
      </div>
      <div>
        <h3 className="text-lg font-semibold mb-4">Video Grid</h3>
        <SkeletonLoadingFallback type="videoGrid" count={4} />
      </div>
      <div>
        <h3 className="text-lg font-semibold mb-4">Brands</h3>
        <SkeletonLoadingFallback type="brands" count={3} />
      </div>
      <div>
        <h3 className="text-lg font-semibold mb-4">Table</h3>
        <SkeletonLoadingFallback type="table" rows={4} columns={4} />
      </div>
    </div>
  ),
};
