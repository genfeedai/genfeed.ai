'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import Toggle from '@workflow-cloud/components/ui/toggle/Toggle';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { HiArrowLeft, HiCog6Tooth } from 'react-icons/hi2';

interface ConfigItem {
  label: string;
  value: string;
}

interface BotToggleProps {
  /**
   * Bot display name
   */
  title: string;
  /**
   * Bot description shown below the title
   */
  description: string;
  /**
   * Icon component to display
   */
  icon: ReactNode;
  /**
   * Background color class for icon container (e.g., 'bg-[#9146FF]/20')
   */
  iconBgColor: string;
  /**
   * Path to the workflow editor for this bot
   */
  editorPath: string;
  /**
   * Status message when bot is enabled
   */
  enabledMessage?: string;
  /**
   * Status message when bot is disabled
   */
  disabledMessage?: string;
  /**
   * Configuration items to display
   */
  configItems: ConfigItem[];
}

/**
 * Reusable bot toggle component
 * Consolidates TwitchChatBot, YouTubeChatBot, and TwitterReplyBot
 */
export default function BotToggle({
  title,
  description,
  icon,
  iconBgColor,
  editorPath,
  enabledMessage = 'Bot is active and responding to messages',
  disabledMessage = 'Bot is currently disabled',
  configItems,
}: BotToggleProps): React.JSX.Element {
  const router = useRouter();
  const { href } = useOrgUrl();
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleToggle(): Promise<void> {
    setIsLoading(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500));
    setIsEnabled(!isEnabled);
    setIsLoading(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href={href('/bots')}
          className="p-2 hover:bg-muted transition-colors"
        >
          <HiArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-3">
          <div className={cn('p-3', iconBgColor)}>{icon}</div>
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
          </div>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Bot Status</h2>
            <p className="text-sm text-muted-foreground">
              {isEnabled ? enabledMessage : disabledMessage}
            </p>
          </div>

          <Toggle
            checked={isEnabled}
            onChange={handleToggle}
            disabled={isLoading}
            size="md"
          />
        </div>

        <div
          className={cn('mt-4 p-4', isEnabled ? 'bg-green-500/10' : 'bg-muted')}
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                isEnabled
                  ? 'bg-green-500 animate-pulse'
                  : 'bg-muted-foreground',
              )}
            />
            <span
              className={cn(
                'text-sm font-medium',
                isEnabled ? 'text-green-500' : 'text-muted-foreground',
              )}
            >
              {isEnabled ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Configuration</h2>
          <Link
            href={editorPath}
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <HiCog6Tooth className="w-4 h-4" />
            Advanced Settings
          </Link>
        </div>

        <div className="space-y-4">
          {configItems.map((item, index) => (
            <div
              key={item.label}
              className={cn(
                'flex items-center justify-between py-2',
                index < configItems.length - 1 &&
                  'border-b border-white/[0.08]',
              )}
            >
              <span className="text-sm">{item.label}</span>
              <span className="text-sm text-muted-foreground">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button
          label="View Workflow"
          variant={ButtonVariant.SECONDARY}
          onClick={() => router.push(href(editorPath))}
        />
      </div>
    </div>
  );
}
