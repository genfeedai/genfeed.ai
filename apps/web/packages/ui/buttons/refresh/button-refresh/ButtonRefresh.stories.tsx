import type { Meta, StoryObj } from '@storybook/nextjs';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import { useState } from 'react';

/**
 * ButtonRefresh component for refresh/reload actions.
 * Shows spinning arrow icon during refresh.
 */
const meta = {
  argTypes: {
    isRefreshing: {
      control: 'boolean',
      description: 'Shows spinning animation',
    },
  },
  component: ButtonRefresh,
  parameters: {
    docs: {
      description: {
        component:
          'A refresh button with an animated spinning arrow icon and built-in loading state.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Buttons/ButtonRefresh',
} satisfies Meta<typeof ButtonRefresh>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default refresh button
 */
export const Default: Story = {
  args: {
    isRefreshing: false,
    onClick: () => {
      // Refresh clicked
    },
  },
};

/**
 * Refreshing state
 */
export const Refreshing: Story = {
  args: {
    isRefreshing: true,
    onClick: () => {},
  },
};

/**
 * With custom className
 */
export const CustomStyle: Story = {
  args: {
    className: '',
    isRefreshing: false,
    onClick: () => {},
  },
};

/**
 * Interactive example
 */
export const Interactive: Story = {
  args: {
    onClick: () => {},
  },
  render: () => {
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

    const handleRefresh = () => {
      setIsRefreshing(true);
      setTimeout(() => {
        setLastRefresh(new Date());
        setIsRefreshing(false);
      }, 2000);
    };

    return (
      <div className="space-y-4 text-center">
        <ButtonRefresh isRefreshing={isRefreshing} onClick={handleRefresh} />

        <div className="text-sm text-foreground/70">
          {isRefreshing
            ? 'Refreshing...'
            : lastRefresh
              ? `Last refreshed: ${lastRefresh.toLocaleTimeString()}`
              : 'Click to refresh'}
        </div>
      </div>
    );
  },
};

/**
 * Data refresh example
 */
export const DataRefresh: Story = {
  args: {
    onClick: () => {},
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [data, setData] = useState(['Item 1', 'Item 2', 'Item 3']);

    const handleRefresh = () => {
      setIsRefreshing(true);
      setTimeout(() => {
        const newItem = `Item ${data.length + 1}`;
        setData((prev) => [...prev, newItem]);
        setIsRefreshing(false);
      }, 1500);
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold">Data List</h4>
          <ButtonRefresh isRefreshing={isRefreshing} onClick={handleRefresh} />
        </div>

        <div className="bg-background p-4 min-h-52">
          <ul className="space-y-2">
            {data.map((item, index) => (
              <li key={index} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary"></span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {isRefreshing && (
          <div className="text-sm text-foreground/70 text-center">
            Loading new data...
          </div>
        )}
      </div>
    );
  },
};

/**
 * Auto-refresh timer
 */
export const AutoRefresh: Story = {
  args: {
    onClick: () => {},
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [count, setCount] = useState(0);

    const doRefresh = () => {
      setIsRefreshing(true);
      setTimeout(() => {
        setCount((prev) => prev + 1);
        setIsRefreshing(false);
      }, 1000);
    };

    useState(() => {
      let interval: NodeJS.Timeout;

      if (autoRefresh) {
        interval = setInterval(() => {
          doRefresh();
        }, 5000);
      }

      return () => {
        if (interval) {
          clearInterval(interval);
        }
      };
    });

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold">Auto-Refresh Demo</h4>
          <ButtonRefresh isRefreshing={isRefreshing} onClick={doRefresh} />
        </div>

        <div className="bg-background p-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">{count}</div>
            <div className="text-sm text-foreground/70 mt-2">Refresh count</div>
          </div>
        </div>

        <label className="flex items-center gap-2 justify-center cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 border-white/[0.08] text-primary focus:ring-primary"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          <span className="text-sm">Auto-refresh every 5 seconds</span>
        </label>
      </div>
    );
  },
};

/**
 * Multiple refresh buttons
 */
export const MultipleRefreshButtons: Story = {
  args: {
    onClick: () => {},
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [refreshStates, setRefreshStates] = useState({
      comments: false,
      posts: false,
      users: false,
    });

    const handleRefresh = (key: keyof typeof refreshStates) => {
      setRefreshStates((prev) => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setRefreshStates((prev) => ({ ...prev, [key]: false }));
      }, 2000);
    };

    return (
      <div className="space-y-4">
        <h4 className="font-semibold">Dashboard Widgets</h4>

        <div className="grid grid-cols-1 gap-4">
          <div className="bg-background p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold">Users</span>
              <ButtonRefresh
                isRefreshing={refreshStates.users}
                onClick={() => handleRefresh('users')}
              />
            </div>
            <div className="text-2xl font-bold text-primary">1,234</div>
          </div>

          <div className="bg-background p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold">Posts</span>
              <ButtonRefresh
                isRefreshing={refreshStates.posts}
                onClick={() => handleRefresh('posts')}
              />
            </div>
            <div className="text-2xl font-bold text-primary">567</div>
          </div>

          <div className="bg-background p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold">Comments</span>
              <ButtonRefresh
                isRefreshing={refreshStates.comments}
                onClick={() => handleRefresh('comments')}
              />
            </div>
            <div className="text-2xl font-bold text-primary">8,901</div>
          </div>
        </div>
      </div>
    );
  },
};

/**
 * Refresh with error handling
 */
export const WithErrorHandling: Story = {
  args: {
    onClick: () => {},
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shouldFail, setShouldFail] = useState(false);

    const handleRefresh = () => {
      setIsRefreshing(true);
      setError(null);

      setTimeout(() => {
        if (shouldFail) {
          setError('Failed to refresh data. Please try again.');
        }
        setIsRefreshing(false);
      }, 1500);
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold">Data Panel</h4>
          <ButtonRefresh isRefreshing={isRefreshing} onClick={handleRefresh} />
        </div>

        <div className="bg-background p-4 min-h-24 flex items-center justify-center">
          {isRefreshing ? (
            <span className="text-foreground/70">Loading...</span>
          ) : error ? (
            <div className="text-error text-sm text-center">
              <div className="font-semibold">Error!</div>
              <div>{error}</div>
            </div>
          ) : (
            <div className="text-success text-sm">Data loaded successfully</div>
          )}
        </div>

        <label className="flex items-center gap-2 justify-center cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 border-white/[0.08] text-destructive focus:ring-destructive"
            checked={shouldFail}
            onChange={(e) => setShouldFail(e.target.checked)}
          />
          <span className="text-sm">Simulate error on refresh</span>
        </label>
      </div>
    );
  },
};
