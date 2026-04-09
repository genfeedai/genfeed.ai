'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import { useDelayedVisibility } from '@hooks/ui/use-delayed-visibility';
import { useIntersectionObserver } from '@hooks/ui/use-intersection-observer/use-intersection-observer';
import { HStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { type ComponentType, useCallback, useEffect, useState } from 'react';
import {
  HiArrowPath,
  HiCpuChip,
  HiDocumentText,
  HiRocketLaunch,
  HiSparkles,
  HiSquaresPlus,
} from 'react-icons/hi2';

interface WorkflowStepData {
  delay: number;
  icon: ComponentType<{ className?: string }>;
  label: string;
  sublabel: string;
}

const WORKFLOW_STEPS: WorkflowStepData[] = [
  {
    delay: 0,
    icon: HiDocumentText,
    label: 'Prompt',
    sublabel: 'Kick off the brief',
  },
  {
    delay: 200,
    icon: HiCpuChip,
    label: 'Research',
    sublabel: 'Find angles that matter',
  },
  {
    delay: 400,
    icon: HiSparkles,
    label: 'Create',
    sublabel: 'Produce every deliverable',
  },
  {
    delay: 600,
    icon: HiRocketLaunch,
    label: 'Publish',
    sublabel: 'Ship across every channel',
  },
  {
    delay: 800,
    icon: HiSquaresPlus,
    label: 'Track',
    sublabel: 'Measure content and KPIs',
  },
];

const ENTRANCE_DURATION = WORKFLOW_STEPS.length * 200 + 500;
const CYCLE_STEP_DURATION = 1200;
const CYCLE_PAUSE = 2000;

function useWorkflowCycle(isIntersecting: boolean): number {
  const [activeStep, setActiveStep] = useState(-1);
  const [entranceDone, setEntranceDone] = useState(false);

  useEffect(() => {
    if (!isIntersecting) {
      return;
    }
    const timer = setTimeout(() => setEntranceDone(true), ENTRANCE_DURATION);
    return () => clearTimeout(timer);
  }, [isIntersecting]);

  const runCycle = useCallback(() => {
    if (!entranceDone) {
      return;
    }

    let step = 0;
    setActiveStep(0);

    const interval = setInterval(() => {
      step += 1;
      if (step >= WORKFLOW_STEPS.length) {
        clearInterval(interval);
        setActiveStep(-1);
      } else {
        setActiveStep(step);
      }
    }, CYCLE_STEP_DURATION);

    return () => clearInterval(interval);
  }, [entranceDone]);

  useEffect(() => {
    if (!entranceDone) {
      return;
    }

    let cleanup: (() => void) | undefined;
    let timeout: ReturnType<typeof setTimeout>;

    function startCycle(): void {
      cleanup = runCycle();
      const cycleDuration =
        WORKFLOW_STEPS.length * CYCLE_STEP_DURATION + CYCLE_PAUSE;
      timeout = setTimeout(startCycle, cycleDuration);
    }

    startCycle();

    return () => {
      cleanup?.();
      clearTimeout(timeout);
    };
  }, [entranceDone, runCycle]);

  return activeStep;
}

function WorkflowStep({
  icon: Icon,
  label,
  sublabel,
  delay,
  isActive,
}: WorkflowStepData & { isActive: boolean }): React.ReactElement {
  const visible = useDelayedVisibility({ delay });

  return (
    <div
      className={cn(
        'flex flex-col items-center transition-all duration-500',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
      )}
    >
      <div
        className={cn(
          'mb-3 flex h-14 w-14 items-center justify-center rounded-xl border transition-all duration-500',
          isActive
            ? 'gen-card-featured shadow-[var(--shadow-glow-sm)] scale-110'
            : 'bg-fill/[0.03] gen-border',
        )}
      >
        <Icon
          className={cn(
            'h-6 w-6 transition-colors duration-500',
            isActive ? 'text-inv-fg' : 'gen-icon',
          )}
        />
      </div>
      <Text
        as="p"
        className={cn(
          'font-bold text-sm uppercase tracking-wider transition-colors duration-500',
          isActive ? 'text-surface' : 'text-surface/80',
        )}
      >
        {label}
      </Text>
      <Text
        as="p"
        className={cn(
          'text-xs transition-colors duration-500',
          isActive ? 'gen-text-accent' : 'gen-text-muted',
        )}
      >
        {sublabel}
      </Text>
    </div>
  );
}

function WorkflowConnector({
  delay,
  isActive,
}: {
  delay: number;
  isActive: boolean;
}): React.ReactElement {
  const visible = useDelayedVisibility({ delay });

  return (
    <div className="flex-1 flex items-center px-2 mt-7">
      <div className="w-full h-px bg-fill/[0.06] relative overflow-hidden">
        {/* Entrance draw animation */}
        <div
          className={cn(
            'absolute inset-y-0 left-0 bg-[var(--gen-accent-border)] transition-all duration-700 ease-out',
            visible ? 'w-full' : 'w-0',
          )}
        />
        {/* Active pulse sweep */}
        <div
          className={cn(
            'absolute inset-y-0 left-0 h-px transition-all duration-500',
            isActive
              ? 'w-full bg-gradient-to-r from-transparent via-[hsl(var(--gen-accent))] to-transparent opacity-100'
              : 'w-0 opacity-0',
          )}
        />
      </div>
    </div>
  );
}

export default function HomeWorkflow(): React.ReactElement {
  const { ref, isIntersecting } = useIntersectionObserver<HTMLElement>({
    threshold: 0.3,
    triggerOnce: true,
  });

  const activeStep = useWorkflowCycle(isIntersecting);

  return (
    <section
      ref={ref}
      className="gen-section-spacing-lg overflow-hidden gen-perf"
    >
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <HStack className="items-center gap-3 mb-3">
            <HiArrowPath className="h-4 w-4 gen-icon" />
            <Text className="gen-label gen-text-accent">How It Works</Text>
          </HStack>
          <Heading
            as="h2"
            className="text-4xl sm:text-5xl font-serif tracking-tighter mb-16"
          >
            From brief to{' '}
            <span className="font-light italic gen-text-heading">tracked.</span>
          </Heading>

          {/* Amber border top */}
          <div className="gen-divider-accent mb-12" />

          {/* Workflow Steps */}
          <div className="flex items-start justify-between max-w-5xl mx-auto mb-12">
            {isIntersecting &&
              WORKFLOW_STEPS.flatMap((stepData, index) => {
                const elements: React.ReactNode[] = [];
                if (index > 0) {
                  const connectorDelay = stepData.delay - 100;
                  const isConnectorActive =
                    activeStep >= index || activeStep === index - 1;
                  elements.push(
                    <WorkflowConnector
                      key={`connector-${stepData.label}`}
                      delay={connectorDelay}
                      isActive={isConnectorActive}
                    />,
                  );
                }
                elements.push(
                  <WorkflowStep
                    key={stepData.label}
                    {...stepData}
                    isActive={activeStep === index}
                  />,
                );
                return elements;
              })}
          </div>

          {/* Amber border bottom */}
          <div className="gen-divider-accent" />
        </div>
      </div>
    </section>
  );
}
