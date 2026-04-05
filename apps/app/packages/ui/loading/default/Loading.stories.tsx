import type { Meta, StoryObj } from '@storybook/nextjs';
import Loading from '@ui/loading/default/Loading';

/**
 * Loading component for full-page or partial loading states.
 */
const meta = {
  component: Loading,
  parameters: {
    docs: {
      description: {
        component:
          'Full-page or partial loading indicator with infinity animation.',
      },
    },
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  title: 'Components/Loading/Loading',
} satisfies Meta<typeof Loading>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Full size loading (default)
 */
export const FullSize: Story = {
  args: {
    isFullSize: true,
  },
};

/**
 * Partial size loading
 */
export const PartialSize: Story = {
  args: {
    isFullSize: false,
  },
  parameters: {
    layout: 'centered',
  },
};
