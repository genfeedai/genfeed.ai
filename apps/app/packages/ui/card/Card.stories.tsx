import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { Meta, StoryObj } from '@storybook/nextjs';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import FormControl from '@ui/forms/base/form-control/FormControl';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import { FiHeart, FiSettings, FiStar, FiTrendingUp } from 'react-icons/fi';

/**
 * The Card component is a flexible container for grouping related content.
 * It supports various layouts including with figures, overlays, icons, and action buttons.
 */
const meta = {
  argTypes: {
    className: {
      control: 'text',
      description: 'Additional CSS classes',
    },
    description: {
      control: 'text',
      description: 'Card subtitle/description',
    },
    index: {
      control: 'number',
      description: 'Optional ordering value used by calling layouts',
    },
    label: {
      control: 'text',
      description: 'Card title/header',
    },
  },
  component: Card,
  parameters: {
    docs: {
      description: {
        component:
          'A versatile compact surface component for grouped content, actions, and media.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/UI/Card',
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Basic card with title and description
 */
export const Basic: Story = {
  args: {
    children: (
      <p className="text-foreground/70">
        Additional content goes here. You can put any React components or HTML
        elements inside the card body.
      </p>
    ),
    description: 'This is a basic card with a title and description.',
    label: 'Card Title',
  },
};

/**
 * Card with an icon
 */
export const WithIcon: Story = {
  args: {
    children: (
      <div className="space-y-2">
        <p className="text-foreground/70">
          Manage your preferences and account details.
        </p>
      </div>
    ),
    description: 'Configure your account settings',
    icon: FiSettings,
    label: 'Settings',
  },
};

/**
 * Card with action buttons
 */
export const WithActions: Story = {
  args: {
    actions: (
      <>
        <Button
          label="Cancel"
          variant={ButtonVariant.GHOST}
          size={ButtonSize.SM}
        />
        <Button
          label="Save"
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
        />
      </>
    ),
    children: (
      <p className="text-foreground/70">
        Save items you love for quick access later.
      </p>
    ),
    description: 'Add this to your favorites',
    icon: FiHeart,
    label: 'Favorite Item',
  },
};

/**
 * Card with custom icon color
 */
export const WithColoredIcon: Story = {
  render: () => (
    <Card
      icon={FiStar}
      iconClassName="text-warning"
      label="Premium Feature"
      description="Upgrade to unlock this feature"
      actions={
        <Button
          label="Upgrade Now"
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
        />
      }
    >
      <p className="text-foreground/70">
        Get access to advanced features with our premium plan.
      </p>
    </Card>
  ),
};

/**
 * Card with image overlay
 */
export const WithOverlay: Story = {
  render: () => (
    <Card
      overlay="https://images.unsplash.com/photo-1579547945413-497e1b99dac0"
      label="Beautiful Landscape"
      description="A stunning view"
      className="w-96"
    >
      <p className="text-white">
        This card has an image overlay with text content on top.
      </p>
    </Card>
  ),
};

/**
 * Compact card without children
 */
export const Compact: Story = {
  args: {
    description: 'View your performance metrics',
    icon: FiTrendingUp,
    label: 'Analytics Dashboard',
  },
};

/**
 * Card with custom styling
 */
export const CustomStyled: Story = {
  args: {
    children: (
      <p className="text-foreground">
        You can apply custom Tailwind classes to style cards.
      </p>
    ),
    className:
      'bg-gradient-to-br from-primary/20 to-secondary/20 border-primary/30',
    description: 'Card with custom background',
    label: 'Gradient Card',
  },
};

/**
 * Card with ordering metadata
 */
export const WithAnimation: Story = {
  args: {
    children: (
      <p className="text-foreground/70">
        The index prop can be used by parent layouts that need stable ordering.
      </p>
    ),
    description: 'Ordering metadata passed through to the card surface',
    icon: FiSettings,
    index: 1,
    label: 'Ordered Card',
  },
};

/**
 * Minimal card (title only)
 */
export const Minimal: Story = {
  args: {
    children: (
      <p className="text-foreground/70">Minimal card with just a title.</p>
    ),
    label: 'Simple Card',
  },
};

/**
 * Card with rich content
 */
export const RichContent: Story = {
  args: {
    actions: (
      <>
        <Button
          label="View Details"
          variant={ButtonVariant.GHOST}
          size={ButtonSize.SM}
        />
        <Button
          label="Export Data"
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
        />
      </>
    ),
    children: (
      <div className="space-y-4">
        <div className="flex flex-col gap-4 border border-white/[0.08] shadow-sm p-4">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Total Views</div>
            <div className="text-2xl font-semibold text-primary">1,234</div>
            <div className="text-xs text-muted-foreground">
              +12% from last month
            </div>
          </div>
          <div className="border-t border-white/[0.08] pt-4 space-y-1">
            <div className="text-sm text-muted-foreground">Engagement Rate</div>
            <div className="text-2xl font-semibold text-secondary">78%</div>
            <div className="text-xs text-muted-foreground">+5% increase</div>
          </div>
        </div>
      </div>
    ),
    className: 'w-96',
    description: 'Manage your content and analytics',
    icon: FiHeart,
    label: 'Content Creator Dashboard',
  },
};

/**
 * Multiple cards showcase
 */
export const MultipleCards: Story = {
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 w-full max-w-4xl">
      {[
        { color: 'text-primary', icon: FiSettings, label: 'Settings' },
        { color: 'text-error', icon: FiHeart, label: 'Favorites' },
        { color: 'text-warning', icon: FiStar, label: 'Premium' },
        { color: 'text-success', icon: FiTrendingUp, label: 'Analytics' },
      ].map((item, index) => (
        <Card
          key={index}
          index={index}
          icon={item.icon}
          iconClassName={item.color}
          label={item.label}
          description={`This is card number ${index + 1}`}
        >
          <p className="text-foreground/70">
            Sample content for {item.label.toLowerCase()} card.
          </p>
        </Card>
      ))}
    </div>
  ),
};

/**
 * Card sizes comparison
 */
export const Sizes: Story = {
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <div className="flex flex-col gap-4 p-4 items-start">
      <Card label="Compact Card" description="Small card" className="w-64">
        <p className="text-sm text-foreground/70">Narrow width card</p>
      </Card>
      <Card label="Medium Card" description="Standard size" className="w-96">
        <p className="text-foreground/70">Default width card</p>
      </Card>
      <Card label="Large Card" description="Wide layout" className="w-[600px]">
        <p className="text-foreground/70">Wide card with more content space</p>
      </Card>
    </div>
  ),
};

/**
 * Interactive card with actions
 */
export const Interactive: Story = {
  parameters: {
    layout: 'centered',
  },
  render: () => {
    const handleSave = () => alert('Saved!');
    const handleDelete = () => alert('Deleted!');

    return (
      <Card
        icon={FiSettings}
        label="User Profile"
        description="Manage your account settings"
        className="w-96"
        actions={
          <>
            <Button
              label="Delete"
              variant={ButtonVariant.DESTRUCTIVE}
              size={ButtonSize.SM}
              onClick={handleDelete}
            />

            <Button
              label="Save"
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              onClick={handleSave}
            />
          </>
        }
      >
        <div className="space-y-4">
          <FormControl label="Username">
            <FormInput
              type="text"
              name="username"
              placeholder="Enter username"
            />
          </FormControl>
          <FormControl label="Email">
            <FormInput type="email" name="email" placeholder="Enter email" />
          </FormControl>
        </div>
      </Card>
    );
  },
};
