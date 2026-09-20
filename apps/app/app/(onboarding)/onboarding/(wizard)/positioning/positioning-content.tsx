'use client';

import ExpertStepActions from '@app/(onboarding)/onboarding/(wizard)/_expert/expert-step-actions';
import ExpertStepHeader from '@app/(onboarding)/onboarding/(wizard)/_expert/expert-step-header';
import PositioningScorecard from '@app/(onboarding)/onboarding/(wizard)/_expert/positioning-scorecard';
import { useOnboarding } from '@contexts/onboarding/onboarding-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  IBrandInterviewAnswerResult,
  IBrandInterviewQuestion,
  IBrandInterviewStep,
  IExpertPositioningScore,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ExpertPathService } from '@services/content/expert-path.service';
import { logger } from '@services/core/logger.service';
import { BrandInterviewService } from '@services/social/brand-interview.service';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ANALYTICS_EVENTS, captureAnalyticsEvent } from '@/lib/analytics';

type PositioningPhase = 'loading' | 'question' | 'ready' | 'scored' | 'error';
type PositioningErrorKey = 'start' | 'answer' | 'finish';

function isExpertQuestion(
  question: IBrandInterviewQuestion | null | undefined,
): question is IBrandInterviewQuestion {
  return question?.group === 'expert';
}

export default function PositioningContent() {
  const translate = useTranslations('pages.onboarding.expert');
  const { handleSkip, handleStepComplete, saving } = useOnboarding();
  const { selectedBrand } = useBrand();
  const brandId = selectedBrand?.id ?? null;

  const getInterviewService = useAuthedService((token: string) =>
    BrandInterviewService.getInstance(token),
  );
  const getExpertPathService = useAuthedService((token: string) =>
    ExpertPathService.getInstance(token),
  );

  const [phase, setPhase] = useState<PositioningPhase>('loading');
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [question, setQuestion] = useState<IBrandInterviewQuestion | null>(
    null,
  );
  const [steps, setSteps] = useState<IBrandInterviewStep[]>([]);
  const [answer, setAnswer] = useState('');
  const [score, setScore] = useState<IExpertPositioningScore | null>(null);
  const [isKeepingGoing, setIsKeepingGoing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<PositioningErrorKey | null>(null);

  const expertSteps = useMemo(
    () => steps.filter((step) => step.group === 'expert'),
    [steps],
  );
  const questionIndex = question
    ? expertSteps.findIndex((step) => step.fieldKey === question.fieldKey)
    : -1;

  const applyQuestion = useCallback(
    (next: IBrandInterviewQuestion | null, keepGoing: boolean) => {
      setAnswer('');
      if (next && (isExpertQuestion(next) || keepGoing)) {
        setQuestion(next);
        setPhase('question');
        return;
      }
      setQuestion(null);
      setPhase('ready');
    },
    [],
  );

  useEffect(() => {
    if (!brandId) {
      return;
    }
    const controller = new AbortController();

    const load = async () => {
      try {
        const status = await (await getExpertPathService()).getStatus(
          brandId,
          controller.signal,
        );
        if (controller.signal.aborted) {
          return;
        }
        if (status.positioning.score) {
          setScore(status.positioning.score);
          setPhase('scored');
          return;
        }

        const service = await getInterviewService();
        const active = await service.getActiveInterview(
          brandId,
          controller.signal,
        );
        const session =
          active?.isExpertPositioning === true
            ? {
                currentQuestion: active.currentQuestion,
                id: active.id,
                steps: active.steps,
              }
            : await service
                .startInterview(brandId, { signal: controller.signal })
                .then((started) => ({
                  currentQuestion: started.currentQuestion,
                  id: started.interviewId,
                  steps: started.steps,
                }));
        if (controller.signal.aborted) {
          return;
        }
        setInterviewId(session.id);
        setSteps(session.steps);
        applyQuestion(session.currentQuestion, false);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('Failed to start the positioning interview', error);
        setErrorKey('start');
        setPhase('error');
      }
    };

    void load();
    return () => controller.abort();
  }, [applyQuestion, brandId, getExpertPathService, getInterviewService]);

  const applyResult = useCallback(
    (result: IBrandInterviewAnswerResult) => {
      setSteps(result.steps);
      if (result.positioningScore) {
        setScore(result.positioningScore);
        setPhase('scored');
        return;
      }
      applyQuestion(result.nextQuestion, isKeepingGoing);
    },
    [applyQuestion, isKeepingGoing],
  );

  const runInterviewAction = useCallback(
    async (
      action: (
        service: BrandInterviewService,
        id: string,
      ) => Promise<IBrandInterviewAnswerResult>,
      failureKey: PositioningErrorKey,
    ) => {
      if (!interviewId) {
        return;
      }
      setIsSubmitting(true);
      setErrorKey(null);
      try {
        applyResult(await action(await getInterviewService(), interviewId));
      } catch (error) {
        logger.error('Positioning interview action failed', error);
        setErrorKey(failureKey);
      } finally {
        setIsSubmitting(false);
      }
    },
    [applyResult, getInterviewService, interviewId],
  );

  const handleSaveAnswer = useCallback(
    () =>
      runInterviewAction(
        (service, id) => service.submitAnswer(id, answer.trim()),
        'answer',
      ),
    [answer, runInterviewAction],
  );

  const handleSkipQuestion = useCallback(
    () =>
      runInterviewAction((service, id) => service.skipQuestion(id), 'answer'),
    [runInterviewAction],
  );

  /**
   * Finish the session and score it. A session that already completed (the
   * last answer closed it) can no longer be completed again, so fall back to
   * re-scoring the stored answers.
   */
  const handleScore = useCallback(async () => {
    if (!brandId) {
      return;
    }
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      if (interviewId) {
        applyResult(
          await (await getInterviewService()).completeInterview(interviewId),
        );
        return;
      }
      const { score: regenerated } = await (
        await getExpertPathService()
      ).regeneratePositioning(brandId);
      setScore(regenerated);
      setPhase('scored');
    } catch (error) {
      logger.error('Failed to score the positioning interview', error);
      try {
        const { score: regenerated } = await (
          await getExpertPathService()
        ).regeneratePositioning(brandId);
        setScore(regenerated);
        setPhase('scored');
      } catch (regenerateError) {
        logger.error('Failed to rescore stored positioning', regenerateError);
        setErrorKey('finish');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    applyResult,
    brandId,
    getExpertPathService,
    getInterviewService,
    interviewId,
  ]);

  const handleKeepGoing = useCallback(async () => {
    if (!brandId) {
      return;
    }
    setIsKeepingGoing(true);
    try {
      const active = await (await getInterviewService()).getActiveInterview(
        brandId,
      );
      applyQuestion(active?.currentQuestion ?? null, true);
    } catch (error) {
      logger.error('Failed to continue the interview', error);
      setErrorKey('answer');
    }
  }, [applyQuestion, brandId, getInterviewService]);

  const handleContinue = useCallback(async () => {
    captureAnalyticsEvent(ANALYTICS_EVENTS.EXPERT_ONBOARDING_STEP, {
      action: 'completed',
      step: 'positioning',
    });
    await handleStepComplete('positioning');
  }, [handleStepComplete]);

  const handleSkipStep = useCallback(async () => {
    captureAnalyticsEvent(ANALYTICS_EVENTS.EXPERT_ONBOARDING_STEP, {
      action: 'skipped',
      step: 'positioning',
    });
    await handleSkip('positioning');
  }, [handleSkip]);

  return (
    <div className="space-y-8">
      <ExpertStepHeader
        title={translate('positioning.title')}
        description={translate('positioning.description')}
      />

      {phase === 'loading' ? (
        <p className="text-sm text-muted-foreground">
          {translate('positioning.loading')}
        </p>
      ) : null}

      {phase === 'question' && question ? (
        <div className="max-w-2xl space-y-4">
          <p className="text-xs text-muted-foreground">
            {questionIndex >= 0
              ? translate('positioning.questionCounter', {
                  current: questionIndex + 1,
                  total: expertSteps.length,
                })
              : translate('positioning.free')}
          </p>
          <p className="text-xl font-medium text-foreground">
            {question.questionText}
          </p>
          {question.hint ? (
            <p className="text-sm text-muted-foreground">{question.hint}</p>
          ) : null}
          <Textarea
            aria-label={translate('positioning.answerLabel')}
            placeholder={translate('positioning.answerPlaceholder')}
            rows={6}
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            isDisabled={isSubmitting}
          />
          {question.examples?.[0] ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">
                {translate('positioning.exampleLabel')}:
              </span>{' '}
              {question.examples[0]}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.DEFAULT}
              label={translate('positioning.save')}
              isDisabled={!answer.trim()}
              isLoading={isSubmitting}
              onClick={handleSaveAnswer}
              className="rounded-none px-5"
            />
            <Button
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.DEFAULT}
              label={translate('positioning.skipQuestion')}
              isDisabled={isSubmitting}
              onClick={handleSkipQuestion}
              className="rounded-none px-5"
            />
            {isKeepingGoing ? (
              <Button
                variant={ButtonVariant.GHOST}
                size={ButtonSize.DEFAULT}
                label={translate('positioning.finish')}
                isDisabled={isSubmitting}
                onClick={handleScore}
                className="rounded-none px-5"
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {phase === 'ready' ? (
        <div className="max-w-2xl space-y-4">
          <p className="text-sm text-muted-foreground">
            {translate('positioning.finishHint')}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.DEFAULT}
              label={translate('positioning.finish')}
              isLoading={isSubmitting}
              onClick={handleScore}
              className="rounded-none px-5"
            />
            <Button
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.DEFAULT}
              label={translate('positioning.keepGoing')}
              isDisabled={isSubmitting}
              onClick={handleKeepGoing}
              className="rounded-none px-5"
            />
          </div>
        </div>
      ) : null}

      {phase === 'scored' && score ? (
        <PositioningScorecard score={score} />
      ) : null}

      {errorKey ? (
        <div className="max-w-2xl">
          <Alert type={AlertCategory.ERROR}>
            <div className="space-y-1">
              <div className="font-medium">
                {translate('common.errorTitle')}
              </div>
              <div className="text-xs text-foreground/70">
                {translate(`positioning.errors.${errorKey}`)}
              </div>
            </div>
          </Alert>
        </div>
      ) : null}

      <ExpertStepActions
        isContinueDisabled={phase !== 'scored'}
        isSubmitting={saving}
        onContinue={handleContinue}
        onSkip={phase === 'scored' ? undefined : handleSkipStep}
      />
    </div>
  );
}
