'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import type {
  IDarkroomCharacter,
  IDarkroomTraining,
} from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableColumn } from '@props/ui/display/table.props';
import { AdminDarkroomService } from '@services/admin/darkroom.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HiOutlineCpuChip } from 'react-icons/hi2';
import TrainingConfigForm from './training-config-form';
import TrainingProgressPanel from './training-progress-panel';
import TrainingResultPanel from './training-result-panel';

const TRAINING_STATUS_COLORS = {
  completed: 'bg-success/10 text-success',
  failed: 'bg-error/10 text-error',
  pending: 'bg-warning/10 text-warning',
  processing: 'bg-info/10 text-info',
  queued: 'bg-foreground/5 text-foreground/60',
} as const;

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

  const { data: characters, error: charactersError } = useQuery<
    IDarkroomCharacter[]
  >({
    queryKey: ['darkroom-characters'],
    queryFn: async () => {
      const service = await getDarkroomService();
      return service.getCharacters();
    },
  });

  const {
    data: trainings,
    isLoading,
    isFetching,
    error: trainingsError,
    refetch: refresh,
  } = useQuery<IDarkroomTraining[]>({
    queryKey: ['darkroom-trainings', selectedCharacter],
    queryFn: async () => {
      const service = await getDarkroomService();
      return service.getTrainings(selectedCharacter || undefined);
    },
  });

  const isRefreshing = isFetching && !isLoading;

  useEffect(() => {
    if (charactersError) {
      logger.error('GET /admin/darkroom/characters failed', charactersError);
    }
  }, [charactersError]);

  useEffect(() => {
    if (trainingsError) {
      logger.error('GET /admin/darkroom/trainings failed', trainingsError);
    }
  }, [trainingsError]);

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
      <TrainingConfigForm
        characters={characters}
        selectedCharacter={selectedCharacter}
        baseModel={baseModel}
        steps={steps}
        loraRank={loraRank}
        learningRate={learningRate}
        hasMinImages={hasMinImages}
        isStarting={isStarting}
        onCharacterChange={setSelectedCharacter}
        onBaseModelChange={setBaseModel}
        onStepsChange={(e) => setSteps(Number(e.target.value))}
        onLoraRankChange={(e) => setLoraRank(Number(e.target.value))}
        onLearningRateChange={(e) => setLearningRate(Number(e.target.value))}
        onStartTraining={handleStartTraining}
      />

      {/* Active Training Progress */}
      {activeTraining &&
        activeTraining.status !== 'completed' &&
        activeTraining.status !== 'failed' && (
          <TrainingProgressPanel training={activeTraining} />
        )}

      {/* Completed/Failed Training Result */}
      {activeTraining &&
        (activeTraining.status === 'completed' ||
          activeTraining.status === 'failed') && (
          <TrainingResultPanel training={activeTraining} />
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
