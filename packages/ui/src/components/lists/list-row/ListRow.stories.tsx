import type { Meta, StoryObj } from '@storybook/nextjs';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { ListRowsSkeleton } from '@ui/lists/list-row/ListRowsSkeleton';

const meta: Meta<typeof ListRow> = {
  argTypes: {},
  component: ListRow,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Lists/ListRow',
};

export default meta;
type Story = StoryObj<typeof ListRow>;

export const Static: Story = {
  args: {
    title: 'Static row',
    description: 'Renders as a non-interactive row.',
    meta: '2h ago',
  },
};

export const Interactive: Story = {
  args: {
    title: 'Interactive row',
    description: 'Renders as a button and calls onClick.',
    ariaLabel: 'Open interactive row',
    onClick: () => undefined,
  },
};

export const LinkForm: Story = {
  args: {
    title: 'Link row',
    description: 'Renders as a next/link anchor.',
    href: '#',
  },
};

export const Compact: Story = {
  args: {
    title: 'Compact row',
    density: 'compact',
  },
};

export const Skeleton: StoryObj<typeof ListRowsSkeleton> = {
  render: (args) => <ListRowsSkeleton {...args} />,
  args: {
    rows: 4,
  },
};
