import type { Meta, StoryObj } from '@storybook/nextjs';
import KPICard from '@ui/kpi/kpi-card/KPICard';

const meta: Meta<typeof KPICard> = {
  argTypes: {},
  component: KPICard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ui/KPICard',
};

export default meta;
type Story = StoryObj<typeof KPICard>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
