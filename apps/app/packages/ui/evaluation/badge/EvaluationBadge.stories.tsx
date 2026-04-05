import type { Meta, StoryObj } from '@storybook/nextjs';
import EvaluationBadge from '@ui/evaluation/badge/EvaluationBadge';

const meta: Meta<typeof EvaluationBadge> = {
  argTypes: {},
  component: EvaluationBadge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Evaluation/EvaluationBadge',
};

export default meta;
type Story = StoryObj<typeof EvaluationBadge>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
