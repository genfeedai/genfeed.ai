import { ButtonVariant } from '@genfeedai/enums';
import type { Meta, StoryObj } from '@storybook/nextjs';
import Button from '@ui/buttons/base/Button';
import Container from '@ui/layout/container/Container';
import { HiCog, HiHome } from 'react-icons/hi2';

/**
 * Container component provides a consistent layout wrapper with title, description,
 * tabs, and left/right action areas.
 */
const meta = {
  argTypes: {
    className: {
      control: 'text',
      description: 'Additional CSS classes',
    },
    description: {
      control: 'text',
      description: 'Container description',
    },
    icon: {
      description: 'Icon element',
    },
    label: {
      control: 'text',
      description: 'Container title/label',
    },
    left: {
      description: 'Left side content',
    },
    right: {
      description: 'Right side content',
    },
    tabs: {
      control: 'object',
      description: 'Array of tab configurations',
    },
  },
  component: Container,
  parameters: {
    docs: {
      description: {
        component:
          'Container component for consistent page layouts with title, tabs, and action areas.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/UI/Container',
} satisfies Meta<typeof Container>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default container
 */
export const Default: Story = {
  args: {
    children: <div>Content</div>,
  },
  parameters: {
    layout: 'fullscreen',
  },
  render: () => (
    <Container label="Container Title">
      <div className="p-8 bg-background">Content goes here</div>
    </Container>
  ),
};

/**
 * Container with description
 */
export const WithDescription: Story = {
  args: {
    children: <div>Content</div>,
  },
  parameters: {
    layout: 'fullscreen',
  },
  render: () => (
    <Container
      label="Settings"
      description="Manage your account settings and preferences"
    >
      <div className="p-8 bg-background">Settings content</div>
    </Container>
  ),
};

/**
 * Container with icon
 */
export const WithIcon: Story = {
  args: {
    children: <div>Content</div>,
  },
  parameters: {
    layout: 'fullscreen',
  },
  render: () => (
    <Container
      label="Dashboard"
      description="Overview of your activity"
      icon={HiHome}
    >
      <div className="p-8 bg-background">Dashboard content</div>
    </Container>
  ),
};

/**
 * Container with right actions
 */
export const WithRightActions: Story = {
  args: {
    children: <div>Content</div>,
  },
  parameters: {
    layout: 'fullscreen',
  },
  render: () => (
    <Container
      label="Items"
      right={
        <>
          <Button label="New Item" variant={ButtonVariant.DEFAULT} />
          <Button label="Filter" variant={ButtonVariant.SECONDARY} />
        </>
      }
    >
      <div className="p-8 bg-background">Items list</div>
    </Container>
  ),
};

/**
 * Container with tabs
 */
export const WithTabs: Story = {
  args: {
    children: <div>Content</div>,
  },
  parameters: {
    layout: 'fullscreen',
  },
  render: () => (
    <Container
      label="Profile"
      tabs={[
        { id: 'overview', label: 'Overview' },
        { id: 'settings', label: 'Settings' },
        { id: 'security', label: 'Security' },
      ]}
    >
      <div className="p-8 bg-background">Tab content</div>
    </Container>
  ),
};

/**
 * Full container example
 */
export const FullExample: Story = {
  args: {
    children: <div>Content</div>,
  },
  parameters: {
    layout: 'fullscreen',
  },
  render: () => (
    <Container
      label="Content Management"
      description="Manage your content and media"
      icon={HiCog}
      tabs={[
        { id: 'videos', label: 'Videos' },
        { id: 'images', label: 'Images' },
        { id: 'audio', label: 'Audio' },
      ]}
      right={
        <>
          <Button label="Upload" variant={ButtonVariant.DEFAULT} />
          <Button label="Filter" variant={ButtonVariant.SECONDARY} />
        </>
      }
    >
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="p-4 bg-background">
            Item {i}
          </div>
        ))}
      </div>
    </Container>
  ),
};
