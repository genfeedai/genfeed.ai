import { BG_BLUR, BORDER_WHITE_30, cn } from '@helpers/formatting/cn/cn.util';
import {
  formatCompactNumber,
  formatNumberWithCommas,
} from '@helpers/formatting/format/format.helper';
import type { Meta, StoryObj } from '@storybook/nextjs';
import Portal from '@ui/layout/portal/Portal';
import { useEffect, useRef, useState } from 'react';
import { HiArrowPath } from 'react-icons/hi2';

/**
 * ButtonCredits component displays user's credit balance with dropdown.
 *
 * Note: This story shows a simplified version without auth/socket dependencies.
 * The actual component requires BrandContext and authenticated OrganizationsService.
 */

// Simplified mock version for Storybook
function ButtonCreditsMock({ balance = 1000 }: { balance?: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ left: 0, top: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const dropdownHeight = 200;
      const spaceBelow = viewportHeight - rect.bottom;
      const shouldShowAbove =
        spaceBelow < dropdownHeight && rect.top > dropdownHeight;

      setDropdownPosition({
        left: rect.left,
        top: shouldShowAbove ? rect.top - dropdownHeight - 8 : rect.bottom + 8,
      });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const dropdown = document.querySelector('.credits-dropdown');

      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        dropdown &&
        !dropdown.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleRefreshBalance = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 1000);
  };

  const compactBalance = formatCompactNumber(balance);
  const fullBalance = formatNumberWithCommas(balance);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex flex-col items-center gap-2 px-2 py-2.5 transition-all',
          'hover:bg-white/10 cursor-pointer',
          isOpen && 'bg-white/10',
        )}
        title={`${fullBalance} credits`}
        aria-label={`${fullBalance} credits`}
      >
        <span className="font-bold text-white text-base leading-none">
          {compactBalance}
        </span>
      </button>

      {isOpen && (
        <Portal>
          <div
            className={cn(
              BG_BLUR,
              BORDER_WHITE_30,
              'credits-dropdown z-[9999] fixed p-3 w-72',
            )}
            style={{
              left: `${dropdownPosition.left}px`,
              top: `${dropdownPosition.top}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3">
              <div className="flex items-baseline gap-2 justify-center">
                <span className="text-3xl font-bold text-white">
                  {fullBalance}
                </span>
                <span className="text-sm text-white/60 uppercase tracking-wide">
                  credits
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleRefreshBalance}
                disabled={isLoading}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 transition-all text-white',
                  'hover:bg-white/10 border border-white/[0.08]',
                  isLoading && 'opacity-50 cursor-not-allowed',
                )}
                title="Refresh Balance"
              >
                <HiArrowPath
                  className={cn(
                    'w-4 h-4 flex-shrink-0',
                    isLoading && 'animate-spin',
                  )}
                />
                <span className="text-sm">Refresh</span>
              </button>

              <button
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 transition-all text-white',
                  'bg-primary/10 hover:bg-primary/20 border border-primary/30',
                )}
                onClick={() => setIsOpen(false)}
                title="Top Up Credits"
              >
                <svg
                  className="w-4 h-4 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span className="text-sm font-black">Top Up</span>
              </button>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}

const meta = {
  argTypes: {
    balance: {
      control: 'number',
      description: 'Credit balance to display',
    },
  },
  component: ButtonCreditsMock,
  decorators: [
    (Story) => (
      <div className="w-full h-96 bg-gradient-to-br from-primary to-secondary p-4 flex items-center justify-center">
        <div className="w-24">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'Displays user credit balance with a dropdown for refresh and top-up actions. Requires BrandContext and OrganizationsService in production.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Buttons/ButtonCredits',
} satisfies Meta<typeof ButtonCreditsMock>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default credits button with 1,000 credits
 */
export const Default: Story = {
  args: {
    balance: 1000,
  },
};

/**
 * Low balance (under 100 credits)
 */
export const LowBalance: Story = {
  args: {
    balance: 45,
  },
};

/**
 * Zero credits
 */
export const ZeroCredits: Story = {
  args: {
    balance: 0,
  },
};

/**
 * Large balance (thousands)
 */
export const LargeBalance: Story = {
  args: {
    balance: 12500,
  },
};

/**
 * Very large balance (millions)
 */
export const VeryLargeBalance: Story = {
  args: {
    balance: 1250000,
  },
};

/**
 * Compact number formatting examples
 */
export const CompactFormatting: Story = {
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <div className="space-y-6 p-6 bg-gradient-to-br from-primary to-secondary">
      <h4 className="text-white font-semibold text-center">
        Balance Display Formats
      </h4>

      <div className="grid grid-cols-2 gap-4">
        <div className="w-24">
          <div className="text-xs text-white/70 text-center mb-2">100</div>
          <ButtonCreditsMock balance={100} />
        </div>

        <div className="w-24">
          <div className="text-xs text-white/70 text-center mb-2">1,000</div>
          <ButtonCreditsMock balance={1000} />
        </div>

        <div className="w-24">
          <div className="text-xs text-white/70 text-center mb-2">10,000</div>
          <ButtonCreditsMock balance={10000} />
        </div>

        <div className="w-24">
          <div className="text-xs text-white/70 text-center mb-2">100,000</div>
          <ButtonCreditsMock balance={100000} />
        </div>

        <div className="w-24">
          <div className="text-xs text-white/70 text-center mb-2">
            1,000,000
          </div>
          <ButtonCreditsMock balance={1000000} />
        </div>

        <div className="w-24">
          <div className="text-xs text-white/70 text-center mb-2">
            10,000,000
          </div>
          <ButtonCreditsMock balance={10000000} />
        </div>
      </div>
    </div>
  ),
};

/**
 * In navigation context
 */
export const InNavigation: Story = {
  parameters: {
    layout: 'padded',
  },
  render: () => (
    <div className="bg-gradient-to-br from-primary to-secondary p-4 w-full max-w-sm">
      <div className="space-y-3">
        <div className="text-white font-semibold text-center mb-4">
          Navigation Menu
        </div>

        <div className="bg-white/10 backdrop-blur-sm p-2">
          <ButtonCreditsMock balance={1234} />
        </div>

        <div className="space-y-1">
          <button className="w-full text-white hover:bg-white/10 p-2 text-sm">
            Dashboard
          </button>
          <button className="w-full text-white hover:bg-white/10 p-2 text-sm">
            Projects
          </button>
          <button className="w-full text-white hover:bg-white/10 p-2 text-sm">
            Settings
          </button>
        </div>
      </div>
    </div>
  ),
};

/**
 * Interactive credit simulation
 */
export const InteractiveSimulation: Story = {
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [balance, setBalance] = useState(1000);

    const spend = (amount: number) => {
      setBalance((prev) => Math.max(0, prev - amount));
    };

    const topUp = (amount: number) => {
      setBalance((prev) => prev + amount);
    };

    return (
      <div className="space-y-6 p-6 bg-gradient-to-br from-primary to-secondary max-w-md">
        <h4 className="text-white font-semibold text-center">
          Credit Simulator
        </h4>

        <div className="flex justify-center">
          <div className="w-24">
            <ButtonCreditsMock balance={balance} />
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-sm p-4 space-y-4">
          <div>
            <div className="text-white text-sm mb-2">Spend Credits:</div>
            <div className="flex gap-2">
              <button
                onClick={() => spend(5)}
                className="h-8 px-3 text-sm flex-1 text-white bg-white/10 hover:bg-white/20 border border-white/30"
                disabled={balance < 5}
              >
                -5
              </button>
              <button
                onClick={() => spend(25)}
                className="h-8 px-3 text-sm flex-1 text-white bg-white/10 hover:bg-white/20 border border-white/30"
                disabled={balance < 25}
              >
                -25
              </button>
              <button
                onClick={() => spend(100)}
                className="h-8 px-3 text-sm flex-1 text-white bg-white/10 hover:bg-white/20 border border-white/30"
                disabled={balance < 100}
              >
                -100
              </button>
            </div>
          </div>

          <div>
            <div className="text-white text-sm mb-2">Top Up:</div>
            <div className="flex gap-2">
              <button
                onClick={() => topUp(100)}
                className="h-8 px-3 text-sm flex-1 text-white bg-primary/30 hover:bg-primary/40 border border-primary/50"
              >
                +100
              </button>
              <button
                onClick={() => topUp(500)}
                className="h-8 px-3 text-sm flex-1 text-white bg-primary/30 hover:bg-primary/40 border border-primary/50"
              >
                +500
              </button>
              <button
                onClick={() => topUp(1000)}
                className="h-8 px-3 text-sm flex-1 text-white bg-primary/30 hover:bg-primary/40 border border-primary/50"
              >
                +1K
              </button>
            </div>
          </div>

          {balance < 50 && (
            <div className="bg-error/20 border border-error/50 p-3 text-white text-sm text-center">
              Low balance! Top up to continue.
            </div>
          )}
        </div>
      </div>
    );
  },
};
