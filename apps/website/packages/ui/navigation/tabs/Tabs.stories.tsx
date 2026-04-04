import type { Meta, StoryObj } from '@storybook/nextjs';
import Badge from '@ui/display/badge/Badge';
import Tabs from '@ui/navigation/tabs/Tabs';
import { useState } from 'react';

/**
 * Tabs component for organizing content into separate views.
 * Uses a modern pill variant for a clean, intuitive interface.
 */
const meta = {
  component: Tabs,
  parameters: {
    docs: {
      description: {
        component:
          'Modern pill-style tabs component for organizing content. Supports string or object tabs, badges, and disabled states.',
      },
    },
    layout: 'padded',
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/',
      },
    },
  },
  tags: ['autodocs'],
  title: 'Components/UI/Tabs',
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Basic tabs with strings
 */
export const Basic: Story = {
  args: {
    activeTab: 'home',
    onTabChange: () => {},
    tabs: ['home', 'profile', 'settings'],
  },
  render: () => {
    const [activeTab, setActiveTab] = useState('home');
    return (
      <Tabs
        tabs={['home', 'profile', 'settings']}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    );
  },
};

/**
 * Tabs with objects
 */
export const WithObjects: Story = {
  args: {
    activeTab: 'home',
    onTabChange: () => {},
    tabs: [
      { id: 'home', label: 'Home' },
      { id: 'profile', label: 'Profile' },
      { id: 'settings', label: 'Settings' },
    ],
  },
  render: () => {
    const [activeTab, setActiveTab] = useState('home');
    return (
      <Tabs
        tabs={[
          { id: 'home', label: 'Home' },
          { id: 'profile', label: 'Profile' },
          { id: 'settings', label: 'Settings' },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    );
  },
};

/**
 * Tabs with badges
 */
export const WithBadges: Story = {
  args: {
    activeTab: 'home',
    onTabChange: () => {},
    tabs: [],
  },
  render: () => {
    const [activeTab, setActiveTab] = useState('home');
    return (
      <Tabs
        tabs={[
          { id: 'home', label: 'Home' },
          {
            badge: <Badge value={12} variant="error" size="sm" />,
            id: 'notifications',
            label: 'Notifications',
          },
          {
            badge: <Badge value={3} variant="primary" size="sm" />,
            id: 'messages',
            label: 'Messages',
          },
          { id: 'settings', label: 'Settings' },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    );
  },
};

/**
 * Modern pill variant with count badges (like Articles/Posts list)
 */
export const WithCounts: Story = {
  args: {
    activeTab: 'drafts',
    onTabChange: () => {},
    tabs: [],
  },
  render: () => {
    const [activeTab, setActiveTab] = useState('drafts');
    return (
      <Tabs
        tabs={[
          {
            badge: <Badge value={5} variant="primary" />,
            id: 'drafts',
            label: 'Drafts',
          },
          {
            badge: <Badge value={12} variant="success" />,
            id: 'published',
            label: 'Published',
          },
          {
            badge: <Badge value={3} variant="warning" />,
            id: 'archived',
            label: 'Archived',
          },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    );
  },
};

/**
 * Tabs with disabled state
 */
export const WithDisabled: Story = {
  args: {
    activeTab: 'home',
    onTabChange: () => {},
    tabs: [],
  },
  render: () => {
    const [activeTab, setActiveTab] = useState('home');
    return (
      <Tabs
        tabs={[
          { id: 'home', label: 'Home' },
          { id: 'profile', label: 'Profile' },
          { id: 'settings', isDisabled: true, label: 'Settings' },
          { id: 'notifications', label: 'Notifications' },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    );
  },
};

/**
 * With content panels
 */
export const WithContentPanels: Story = {
  args: {
    activeTab: 'home',
    onTabChange: () => {},
    tabs: ['home', 'profile', 'settings'],
  },
  render: () => {
    const [activeTab, setActiveTab] = useState('home');

    return (
      <div className="space-y-4">
        <Tabs
          tabs={['home', 'profile', 'settings']}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <div className=" border border-white/[0.08] bg-background p-6">
          {activeTab === 'home' && (
            <div>
              <h3 className="font-bold text-lg mb-2">Home Content</h3>
              <p>Welcome to your home dashboard!</p>
            </div>
          )}
          {activeTab === 'profile' && (
            <div>
              <h3 className="font-bold text-lg mb-2">Profile Content</h3>
              <p>Manage your profile settings here.</p>
            </div>
          )}
          {activeTab === 'settings' && (
            <div>
              <h3 className="font-bold text-lg mb-2">Settings Content</h3>
              <p>Configure your application settings.</p>
            </div>
          )}
        </div>
      </div>
    );
  },
};
