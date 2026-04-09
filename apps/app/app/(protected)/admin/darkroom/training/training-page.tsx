'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type {
  IDarkroomCharacter,
  IDarkroomTraining,
} from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import type { TableColumn } from '@props/ui/display/table.props';
import { AdminDarkroomService } from '@services/admin/darkroom.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HiOutlineCpuChip } from 'react-icons/hi2';

const TRAINING_STATUS_COLORS = {
  completed: 'bg-success/10 text-success',
  failed: 'bg-error/10 text-error',
  pending: 'bg-warning/10 text-warning',
  processing: 'bg-info/10 text-info',
  queued: 'bg-foreground/5 text-foreground/60',
} as const;

const STAGE_EMOJIS: Record<string, string> = {
  completed: '✅',
  downloading: '📥',
  failed: '❌',
  preparing: '📦',
  processing: '⚡',
  queued: '🕐',
  training: '🧠',
  uploading: '📤',
};

const ALL_CHARACTERS_VALUE = '__all-characters__';

export default function TrainingPage() {
  const notificationsService = NotificationsService.getInstance();

  const getDarkroomService = useAuthedService((token: string) =>
    AdminDarkroomService.getInstance(token),
  );

  const [selectedCharacter, setSelectedCharacter] = useState<string>('');
  const [baseModel, setBaseModel] = useState<string>(
    'genfeed-ai/z-image-turbo',
  );
  const [steps, setSteps] = useState(1000);
  const [loraRank, setLoraRank] = useState(16);
  const [learningRate, setLearningRate] = useState(0.0001);
  const [isStarting, setIsStarting] = useState(false);
  const [activeTraining, setActiveTraining] =
    useState<IDarkroomTraining | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: characters } = useResource<IDarkroomCharacter[]>(
    async () => {
      const service = await getDarkroomService();
      return service.getCharacters();
    },
    {
      onError: (error: unknown) => {
        logger.error('GET /admin/darkroom/characters failed', error);
      },
    },
  );

  const {
    data: trainings,
    isLoading,
    isRefreshing,
    refresh,
  } = useResource<IDarkroomTraining[]>(
    async () => {
      const service = await getDarkroomService();
      return service.getTrainings(selectedCharacter || undefined);
    },
    {
      dependencies: [selectedCharacter],
      onError: (error: unknown) => {
        logger.error('GET /admin/darkroom/trainings failed', error);
      },
    },
  );

  // Refetch trainings when character filter changes
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    refresh();
  }, [refresh]);

  const selectedChar = (characters || []).find(
    (c) => c.slug === selectedCharacter,
  );

  const hasMinImages =
    !selectedChar || (selectedChar.selectedImagesCount ?? 0) >= 8;

  const handleStartTraining = useCallback(async () => {
    if (!selectedCharacter) {
      return;
    }

    setIsStarting(true);

    try {
      const service = await getDarkroomService();
      const training = await service.startTraining({
        baseModel,
        label: `${selectedCharacter}-${Date.now()}`,
        learningRate,
        loraRank,
        personaSlug: selectedCharacter,
        sourceIds: [],
        steps,
      });

      setActiveTraining(training);
      notificationsService.success('Training started');
      refresh();
    } catch (error) {
      logger.error('POST /admin/darkroom/trainings failed', error);
      notificationsService.error('Failed to start training');
    } finally {
      setIsStarting(false);
    }
  }, [
    selectedCharacter,
    baseModel,
    steps,
    loraRank,
    learningRate,
    getDarkroomService,
    notificationsService,
    refresh,
  ]);

  // Poll active training status
  useEffect(() => {
    if (!activeTraining) {
      return;
    }

    const poll = async () => {
      try {
        const service = await getDarkroomService();
        const updated = await service.getTraining(activeTraining.id);

        setActiveTraining(updated);

        if (updated.status === 'completed' || updated.status === 'failed') {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }

          refresh();

          if (updated.status === 'completed') {
            notificationsService.success('Training completed');
          } else {
            notificationsService.error('Training failed');
          }
        }
      } catch (error) {
        logger.error('Failed to poll training status', error);
      }
    };

    pollingRef.current = setInterval(poll, 3000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [
    activeTraining?.id,
    getDarkroomService,
    notificationsService,
    refresh,
    activeTraining,
  ]);

  const columns: TableColumn<IDarkroomTraining>[] = [
    { header: 'Label', key: 'label' },
    { header: 'Character', key: 'personaSlug' },
    {
      header: 'Base Model',
      key: 'baseModel',
      render: (t: IDarkroomTraining) =>
        t.baseModel?.replace('genfeed-ai/', '') ?? '-',
    },
    {
      header: 'Status',
      key: 'status',
      render: (t: IDarkroomTraining) => (
        <Badge
          className={
            TRAINING_STATUS_COLORS[
              t.status as keyof typeof TRAINING_STATUS_COLORS
            ] ?? 'bg-foreground/5 text-foreground/60'
          }
        >
          {t.status}
        </Badge>
      ),
    },
    {
      header: 'Steps',
      key: 'steps',
      render: (t: IDarkroomTraining) => t.steps ?? '-',
    },
    {
      header: 'Created',
      key: 'createdAt',
      render: (t: IDarkroomTraining) =>
        new Date(t.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <Container
      label="LoRA Training"
      description="Manage LoRA training jobs for darkroom characters"
      icon={HiOutlineCpuChip}
      right={
        <ButtonRefresh onClick={() => refresh()} isRefreshing={isRefreshing} />
      }
    >
      {/* Training Configuration */}
      <WorkspaceSurface
        title="Start New Training"
        tone="muted"
        data-testid="darkroom-training-config-surface"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Character Selector */}
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">
                Character
              </label>
              <Select
                onValueChange={(value) =>
                  setSelectedCharacter(
                    value === ALL_CHARACTERS_VALUE ? '' : value,
                  )
                }
                value={selectedCharacter || ALL_CHARACTERS_VALUE}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CHARACTERS_VALUE}>
                    Select a character...
                  </SelectItem>
                  {(characters || []).map((c) => (
                    <SelectItem key={c.id} value={c.slug}>
                      {c.emoji ? `${c.emoji} ` : ''}
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Base Model */}
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">
                Base Model
              </label>
              <Select onValueChange={setBaseModel} value={baseModel}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="genfeed-ai/z-image-turbo">
                    Z-Image Turbo (Recommended)
                  </SelectItem>
                  <SelectItem value="genfeed-ai/z-image-turbo-lora">
                    Z-Image Turbo LoRA
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Steps */}
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">
                Steps
              </label>
              <Input
                className="w-full"
                min={100}
                onChange={(e) => setSteps(Number(e.target.value))}
                type="number"
                value={steps}
              />
            </div>

            {/* LoRA Rank */}
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">
                LoRA Rank
              </label>
              <Input
                className="w-full"
                min={1}
                onChange={(e) => setLoraRank(Number(e.target.value))}
                type="number"
                value={loraRank}
              />
            </div>

            {/* Learning Rate */}
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">
                Learning Rate
              </label>
              <Input
                className="w-full"
                onChange={(e) => setLearningRate(Number(e.target.value))}
                step={0.0001}
                type="number"
                value={learningRate}
              />
            </div>
          </div>

          {/* Warning for insufficient images */}
          {selectedCharacter && !hasMinImages && (
            <div className="mb-4 px-4 py-3 rounded bg-warning/10 text-warning text-sm">
              This character has fewer than 8 selected images. Training may
              produce poor results.
            </div>
          )}

          <Button
            withWrapper={false}
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
            isDisabled={!selectedCharacter || isStarting}
            onClick={handleStartTraining}
          >
            {isStarting ? 'Starting...' : 'Start Training'}
          </Button>
        </div>
      </WorkspaceSurface>

      {/* Active Training Progress */}
      {activeTraining &&
        activeTraining.status !== 'completed' &&
        activeTraining.status !== 'failed' && (
          <WorkspaceSurface
            title="Training In Progress"
            tone="muted"
            className="mt-6"
            data-testid="darkroom-training-progress-surface"
          >
            <div className="space-y-3">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">
                  {STAGE_EMOJIS[activeTraining.stage || 'processing'] || '⚡'}
                </span>

                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">
                      {activeTraining.stage || activeTraining.status}
                    </span>

                    <span className="text-sm text-foreground/60">
                      {activeTraining.progress != null
                        ? `${Math.round(activeTraining.progress)}%`
                        : activeTraining.currentStep &&
                            activeTraining.totalSteps
                          ? `${activeTraining.currentStep}/${activeTraining.totalSteps}`
                          : '...'}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 rounded-full bg-foreground/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{
                        width: `${activeTraining.progress ?? 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <p className="text-sm text-foreground/50">
                {activeTraining.label} - {activeTraining.personaSlug}
              </p>
            </div>
          </WorkspaceSurface>
        )}

      {/* Completed/Failed Training Link */}
      {activeTraining &&
        (activeTraining.status === 'completed' ||
          activeTraining.status === 'failed') && (
          <WorkspaceSurface
            title={`Training ${activeTraining.status}`}
            tone="muted"
            className="mt-6"
            data-testid="darkroom-training-result-surface"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {activeTraining.status === 'completed' ? '✅' : '❌'}
              </span>

              <div>
                {activeTraining.status === 'completed' && (
                  <Link
                    href={`/darkroom/characters/${activeTraining.personaSlug}`}
                    className="text-sm text-primary hover:underline"
                  >
                    View character
                  </Link>
                )}
              </div>
            </div>
          </WorkspaceSurface>
        )}

      {/* Recent Trainings Table */}
      <WorkspaceSurface
        className="mt-6"
        title="Recent Trainings"
        tone="muted"
        data-testid="darkroom-training-table-surface"
      >
        {!isLoading && (!trainings || trainings.length === 0) ? (
          <CardEmpty label="No training jobs found" />
        ) : (
          <AppTable<IDarkroomTraining>
            columns={columns}
            emptyLabel="No training jobs found"
            getRowKey={(t) => t.id}
            isLoading={isLoading}
            items={trainings || []}
          />
        )}
      </WorkspaceSurface>
    </Container>
  );
}
