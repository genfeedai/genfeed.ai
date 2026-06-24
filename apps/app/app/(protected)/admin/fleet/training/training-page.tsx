'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import type { IFleetCharacter, IFleetTraining } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableColumn } from '@props/ui/display/table.props';
import { AdminFleetService } from '@services/admin/fleet.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { useCallback, useEffect, useReducer, useRef } from 'react';
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

type TrainingState = {
  selectedCharacter: string;
  baseModel: string;
  steps: number;
  loraRank: number;
  learningRate: number;
  isStarting: boolean;
  activeTraining: IFleetTraining | null;
};

type TrainingAction =
  | { type: 'SET_CHARACTER'; payload: string }
  | { type: 'SET_BASE_MODEL'; payload: string }
  | { type: 'SET_STEPS'; payload: number }
  | { type: 'SET_LORA_RANK'; payload: number }
  | { type: 'SET_LEARNING_RATE'; payload: number }
  | { type: 'SET_IS_STARTING'; payload: boolean }
  | { type: 'SET_ACTIVE_TRAINING'; payload: IFleetTraining | null };

const INITIAL_TRAINING_STATE: TrainingState = {
  selectedCharacter: '',
  baseModel: 'genfeed-ai/z-image-turbo',
  steps: 1000,
  loraRank: 16,
  learningRate: 0.0001,
  isStarting: false,
  activeTraining: null,
};

function trainingReducer(
  state: TrainingState,
  action: TrainingAction,
): TrainingState {
  switch (action.type) {
    case 'SET_CHARACTER':
      return { ...state, selectedCharacter: action.payload };
    case 'SET_BASE_MODEL':
      return { ...state, baseModel: action.payload };
    case 'SET_STEPS':
      return { ...state, steps: action.payload };
    case 'SET_LORA_RANK':
      return { ...state, loraRank: action.payload };
    case 'SET_LEARNING_RATE':
      return { ...state, learningRate: action.payload };
    case 'SET_IS_STARTING':
      return { ...state, isStarting: action.payload };
    case 'SET_ACTIVE_TRAINING':
      return { ...state, activeTraining: action.payload };
  }
}

export default function TrainingPage() {
  const notificationsService = NotificationsService.getInstance();

  const getFleetService = useAuthedService((token: string) =>
    AdminFleetService.getInstance(token),
  );

  const [state, dispatch] = useReducer(trainingReducer, INITIAL_TRAINING_STATE);
  const {
    selectedCharacter,
    baseModel,
    steps,
    loraRank,
    learningRate,
    isStarting,
    activeTraining,
  } = state;

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: characters } = useQuery<IFleetCharacter[]>({
    queryKey: ['fleet-characters'],
    queryFn: async () => {
      const service = await getFleetService();
      try {
        return await service.getCharacters();
      } catch (error) {
        logger.error('GET /admin/fleet/characters failed', error);
        throw error;
      }
    },
  });

  const {
    data: trainings,
    isLoading,
    isFetching,
    refetch: refresh,
  } = useQuery<IFleetTraining[]>({
    queryKey: ['fleet-trainings', selectedCharacter],
    queryFn: async () => {
      const service = await getFleetService();
      try {
        return await service.getTrainings(selectedCharacter || undefined);
      } catch (error) {
        logger.error('GET /admin/fleet/trainings failed', error);
        throw error;
      }
    },
  });

  const isRefreshing = isFetching && !isLoading;

  const selectedChar = (characters || []).find(
    (c) => c.slug === selectedCharacter,
  );

  const hasMinImages =
    !selectedChar || (selectedChar.selectedImagesCount ?? 0) >= 8;

  const handleStartTraining = useCallback(async () => {
    if (!selectedCharacter) {
      return;
    }

    dispatch({ type: 'SET_IS_STARTING', payload: true });

    try {
      const service = await getFleetService();
      const training = await service.startTraining({
        baseModel,
        label: `${selectedCharacter}-${Date.now()}`,
        learningRate,
        loraRank,
        personaSlug: selectedCharacter,
        sourceIds: [],
        steps,
      });

      dispatch({ type: 'SET_ACTIVE_TRAINING', payload: training });
      notificationsService.success('Training started');
      refresh();
    } catch (error) {
      logger.error('POST /admin/fleet/trainings failed', error);
      notificationsService.error('Failed to start training');
    } finally {
      dispatch({ type: 'SET_IS_STARTING', payload: false });
    }
  }, [
    selectedCharacter,
    baseModel,
    steps,
    loraRank,
    learningRate,
    getFleetService,
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
        const service = await getFleetService();
        const updated = await service.getTraining(activeTraining.id);

        dispatch({ type: 'SET_ACTIVE_TRAINING', payload: updated });

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
    getFleetService,
    notificationsService,
    refresh,
    activeTraining,
  ]);

  const columns: TableColumn<IFleetTraining>[] = [
    { header: 'Label', key: 'label' },
    { header: 'Character', key: 'personaSlug' },
    {
      header: 'Base Model',
      key: 'baseModel',
      render: (t: IFleetTraining) =>
        t.baseModel?.replace('genfeed-ai/', '') ?? '-',
    },
    {
      header: 'Status',
      key: 'status',
      render: (t: IFleetTraining) => (
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
      render: (t: IFleetTraining) => t.steps ?? '-',
    },
    {
      header: 'Created',
      key: 'createdAt',
      render: (t: IFleetTraining) => new Date(t.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <Container
      label="LoRA Training"
      description="Manage LoRA training jobs for fleet characters"
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
        onCharacterChange={(v) =>
          dispatch({ type: 'SET_CHARACTER', payload: v })
        }
        onBaseModelChange={(v) =>
          dispatch({ type: 'SET_BASE_MODEL', payload: v })
        }
        onStepsChange={(e) =>
          dispatch({ type: 'SET_STEPS', payload: Number(e.target.value) })
        }
        onLoraRankChange={(e) =>
          dispatch({ type: 'SET_LORA_RANK', payload: Number(e.target.value) })
        }
        onLearningRateChange={(e) =>
          dispatch({
            type: 'SET_LEARNING_RATE',
            payload: Number(e.target.value),
          })
        }
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
        data-testid="fleet-training-table-surface"
      >
        {!isLoading && (!trainings || trainings.length === 0) ? (
          <CardEmpty label="No training jobs found" />
        ) : (
          <AppTable<IFleetTraining>
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
