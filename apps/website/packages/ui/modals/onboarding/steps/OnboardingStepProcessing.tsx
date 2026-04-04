'use client';

import { useEffect, useState } from 'react';
import { HiCheck, HiOutlineSparkles } from 'react-icons/hi2';

export interface OnboardingStepProcessingProps {
  url: string;
}

const processingSteps = [
  { id: 'fetch', label: 'Fetching website content' },
  { id: 'colors', label: 'Extracting brand colors' },
  { id: 'voice', label: 'Analyzing tone of voice' },
  { id: 'prompts', label: 'Generating brand prompts' },
];

/**
 * Processing step - shows progress while analyzing website
 */
export default function OnboardingStepProcessing({
  url,
}: OnboardingStepProcessingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);

  // Simulate progress (actual progress comes from backend)
  useEffect(() => {
    const stepDuration = 5000; // 5 seconds per step
    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev < processingSteps.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, stepDuration);

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev < 90) {
          return prev + 1;
        }
        return prev;
      });
    }, 200);

    return () => {
      clearInterval(stepInterval);
      clearInterval(progressInterval);
    };
  }, []);

  return (
    <div className="py-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
          <HiOutlineSparkles className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-semibold mb-2">Analyzing your brand</h2>
        <p className="text-muted-foreground text-sm truncate max-w-xs mx-auto">
          {url}
        </p>
      </div>

      {/* Progress bar */}
      <div className="max-w-sm mx-auto mb-8">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-center text-sm text-muted-foreground mt-2">
          {progress}%
        </p>
      </div>

      {/* Step indicators */}
      <div className="max-w-sm mx-auto space-y-3">
        {processingSteps.map((step, index) => {
          const isComplete = index < currentStep;
          const isCurrent = index === currentStep;

          return (
            <div
              key={step.id}
              className={`flex items-center gap-3 p-3 transition-colors ${
                isCurrent
                  ? 'bg-primary/10'
                  : isComplete
                    ? 'bg-muted/50'
                    : 'opacity-50'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                  isComplete
                    ? 'bg-green-500 text-white'
                    : isCurrent
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                }`}
              >
                {isComplete ? (
                  <HiCheck className="w-4 h-4" />
                ) : isCurrent ? (
                  <span className="w-2 h-2 bg-current rounded-full animate-pulse" />
                ) : (
                  <span className="w-2 h-2 bg-muted-foreground/30 rounded-full" />
                )}
              </div>
              <span
                className={`text-sm ${
                  isCurrent ? 'font-medium' : 'text-muted-foreground'
                }`}
              >
                {step.label}
                {isCurrent && '...'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
