import type { Meta, StoryObj } from '@storybook/nextjs';
import Referral from '@ui/content/referral/Referral';

const meta: Meta<typeof Referral> = {
  argTypes: {},
  component: Referral,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ui/Referral',
};

export default meta;
type Story = StoryObj<typeof Referral>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
