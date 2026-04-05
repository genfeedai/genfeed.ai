import type { Meta, StoryObj } from '@storybook/nextjs';
import KPISection from '@ui/kpi/kpi-section/KPISection';

const meta: Meta<typeof KPISection> = {
  argTypes: {},
  component: KPISection,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ui/KPISection',
};

export default meta;
type Story = StoryObj<typeof KPISection>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
