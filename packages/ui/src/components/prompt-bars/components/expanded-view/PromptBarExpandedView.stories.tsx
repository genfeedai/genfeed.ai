import type { Meta, StoryObj } from '@storybook/nextjs';
import PromptBarExpandedView from '@ui/prompt-bars/components/expanded-view/PromptBarExpandedView';
import { useForm } from 'react-hook-form';

const meta: Meta<typeof PromptBarExpandedView> = {
  argTypes: {
    isAdvancedMode: { control: 'boolean' },
    isAutoMode: { control: 'boolean' },
    isCollapsed: { control: 'boolean' },
  },
  component: PromptBarExpandedView,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  title: 'Components/PromptBars/ExpandedView',
};

export default meta;
type Story = StoryObj<typeof PromptBarExpandedView>;

const mockForm = useForm();

export const Default: Story = {
  args: {
    controlClass: '',
    currentConfig: {},
    form: mockForm,
    iconButtonClass: '',
    isAdvancedMode: false,
    isAutoMode: false,
    isCollapsed: false,
    isDisabledState: false,
    onClear: () => {},
    onCollapse: () => {},
    onCopy: () => {},
    onGenerate: () => {},
    pathname: '/studio/image',
    setIsAdvancedMode: () => {},
    setIsAutoMode: () => {},
    setIsCollapsed: () => {},
  },
};
