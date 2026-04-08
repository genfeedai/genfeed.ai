'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import DropdownBase from '@components/dropdowns/base/DropdownBase';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Bot } from '@models/automation/bot.model';
import { BotsService } from '@services/automation/bots.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Container from '@ui/layout/container/Container';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button as PrimitiveButton } from '@ui/primitives/button';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  HiEllipsisVertical,
  HiOutlineCpuChip,
  HiPencil,
  HiTrash,
} from 'react-icons/hi2';

const BOT_SKELETON_KEYS = [
  'bot-skeleton-1',
  'bot-skeleton-2',
  'bot-skeleton-3',
  'bot-skeleton-4',
] as const;

function getBotStatusVariant(status: string): 'success' | 'warning' | 'error' {
  switch (status) {
    case 'active':
      return 'success';
    case 'paused':
      return 'warning';
    default:
      return 'error';
  }
}

export default function BotsPage() {
  const getBotsService = useAuthedService((token: string) =>
    BotsService.getInstance(token),
  );

  const notificationsService = NotificationsService.getInstance();

  const [bots, setBots] = useState<Bot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadBots = useCallback(
    async (refresh: boolean = false) => {
      if (!refresh) {
        setIsLoading(true);
      }
      setIsRefreshing(refresh);

      try {
        const service = await getBotsService();
        const fetchedBots = await service.findAll({
          pagination: false,
          sort: 'createdAt: -1',
        });

        setBots(fetchedBots);
        logger.info('Loaded bots', { count: fetchedBots.length });
      } catch (error) {
        logger.error('Failed to load bots', error);
        notificationsService.error('Failed to load bots');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [getBotsService, notificationsService],
  );

  useEffect(() => {
    loadBots();
  }, [loadBots]);

  if (isLoading) {
    return (
      <Container
        label="Bots"
        description="Manage automation bots for X/Twitter, Twitch, and YouTube"
        icon={HiOutlineCpuChip}
      >
        <div className="grid gap-4">
          {BOT_SKELETON_KEYS.map((key) => (
            <SkeletonCard key={key} showImage={false} />
          ))}
        </div>
      </Container>
    );
  }

  return (
    <Container
      label="Bots"
      description="Manage automation bots for X/Twitter, Twitch, and YouTube"
      icon={HiOutlineCpuChip}
      right=<ButtonRefresh
        onClick={() => loadBots(true)}
        isRefreshing={isRefreshing}
      />
    >
      <WorkspaceSurface
        title="Automation Bots"
        tone="muted"
        data-testid="automation-bots-surface"
      >
        <div className="grid gap-4">
          {bots.length === 0 ? (
            <CardEmpty label="No bots yet" />
          ) : (
            bots.map((bot: Bot) => (
              <Card key={bot.id}>
                <div className="p-6">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="card-label text-lg">{bot.label}</h3>
                        <Badge variant={getBotStatusVariant(bot.status)}>
                          {bot.status}
                        </Badge>

                        <Badge variant="outline" className="capitalize">
                          {bot.category}
                        </Badge>
                      </div>

                      {bot.description && (
                        <p className="text-foreground/70 mb-3">
                          {bot.description}
                        </p>
                      )}

                      <div className="flex items-center gap-4 text-sm text-foreground/60 mb-3">
                        {bot.platforms && bot.platforms.length > 0 && (
                          <span>Platforms: {bot.platforms.join(', ')}</span>
                        )}
                        {bot.messagesCount !== undefined && (
                          <span>{bot.messagesCount} messages</span>
                        )}
                        {bot.engagementsCount !== undefined && (
                          <span>{bot.engagementsCount} engagements</span>
                        )}
                      </div>

                      {bot.targets && bot.targets.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          <span className="text-xs text-foreground/60">
                            Targets:
                          </span>
                          {bot.targets.map((target) => (
                            <code
                              key={`${target.platform}:${target.channelId}:${target.channelLabel ?? ''}`}
                              className="text-xs bg-background px-2 py-1"
                            >
                              {target.platform}:{' '}
                              {target.channelLabel || target.channelId}
                            </code>
                          ))}
                        </div>
                      )}
                    </div>

                    <DropdownBase
                      trigger={
                        <Button
                          variant={ButtonVariant.GHOST}
                          size={ButtonSize.ICON}
                        >
                          <HiEllipsisVertical className="w-4 h-4" />
                        </Button>
                      }
                      usePortal
                    >
                      <ul className="menu p-0">
                        <li>
                          <PrimitiveButton asChild variant={ButtonVariant.SOFT}>
                            <Link href={`/bots/${bot.id}/edit`}>
                              <HiPencil className="w-4 h-4" />
                              Edit
                            </Link>
                          </PrimitiveButton>
                        </li>
                        <li>
                          <PrimitiveButton
                            asChild
                            variant={ButtonVariant.SOFT}
                            className="text-error"
                          >
                            <Link href={`/bots/${bot.id}/delete`}>
                              <HiTrash className="w-4 h-4" />
                              Delete
                            </Link>
                          </PrimitiveButton>
                        </li>
                      </ul>
                    </DropdownBase>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </WorkspaceSurface>
    </Container>
  );
}
