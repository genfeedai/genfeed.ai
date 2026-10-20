import { ButtonVariant } from '@genfeedai/contracts';
import type { IOnboardingDraftContext } from '@genfeedai/contracts/interfaces';
import type { FirstDraftsContextFormProps } from '@genfeedai/props/onboarding/first-drafts.props';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const GOALS = ['grow', 'sell', 'authority'] as const;
const TONES = ['keep', 'casual', 'professional'] as const;
const MAX_GOALS = 3;
const MAX_SUGGESTIONS = 3;

function Suggestions({
  onPick,
  values,
}: {
  onPick: (value: string) => void;
  values: readonly string[];
}) {
  const t = useTranslations('pages.onboarding.firstDrafts.context');
  if (values.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">{t('suggested')}</span>
      {values.slice(0, MAX_SUGGESTIONS).map((value) => (
        <Button
          key={value}
          label={value}
          variant={ButtonVariant.SECONDARY}
          onClick={() => onPick(value)}
        />
      ))}
    </div>
  );
}

export default function ContextForm({
  audienceSuggestions,
  hasError,
  isScanFailed,
  isWebsiteMissing,
  offerSuggestions,
  onSubmit,
}: FirstDraftsContextFormProps) {
  const t = useTranslations('pages.onboarding.firstDrafts');
  const [audience, setAudience] = useState('');
  const [offer, setOffer] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [tone, setTone] = useState<(typeof TONES)[number]>('keep');

  function toggleGoal(goal: string) {
    setGoals((current) =>
      current.includes(goal)
        ? current.filter((entry) => entry !== goal)
        : [...current, goal].slice(0, MAX_GOALS),
    );
  }

  return (
    <Form
      spacing="section"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          ...(audience.trim() ? { audience: audience.trim() } : {}),
          ...(offer.trim() ? { offer: offer.trim() } : {}),
          ...(goals.length > 0
            ? { goals: goals.map((goal) => t(`context.goals.${goal}`)) }
            : {}),
          tone,
        });
      }}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{t('context.title')}</h1>
        <p className="text-muted-foreground">
          {isScanFailed
            ? t('context.scanFailed')
            : isWebsiteMissing
              ? t('context.descriptionNoWebsite')
              : t('context.description')}
        </p>
      </div>

      <Field label={t('context.audience.label')}>
        <Input
          value={audience}
          placeholder={t('context.audience.placeholder')}
          maxLength={200}
          onChange={(event) => setAudience(event.target.value)}
        />
      </Field>
      <Suggestions values={audienceSuggestions} onPick={setAudience} />

      <Field label={t('context.offer.label')}>
        <Input
          value={offer}
          placeholder={t('context.offer.placeholder')}
          maxLength={200}
          onChange={(event) => setOffer(event.target.value)}
        />
      </Field>
      <Suggestions values={offerSuggestions} onPick={setOffer} />

      <Field label={t('context.goals.label')}>
        <div className="flex flex-wrap gap-2">
          {GOALS.map((goal) => (
            <Button
              key={goal}
              label={t(`context.goals.${goal}`)}
              ariaLabel={t(`context.goals.${goal}`)}
              variant={
                goals.includes(goal)
                  ? ButtonVariant.DEFAULT
                  : ButtonVariant.SECONDARY
              }
              onClick={() => toggleGoal(goal)}
            />
          ))}
        </div>
      </Field>

      <Field label={t('context.tone.label')}>
        <div className="flex flex-wrap gap-2">
          {TONES.map((option) => (
            <Button
              key={option}
              label={t(`context.tone.${option}`)}
              variant={
                tone === option
                  ? ButtonVariant.DEFAULT
                  : ButtonVariant.SECONDARY
              }
              onClick={() => setTone(option)}
            />
          ))}
        </div>
      </Field>

      {hasError ? (
        <p role="alert" className="text-sm text-destructive">
          {t('errors.generate')}
        </p>
      ) : null}

      <div>
        <Button type="submit" label={t('context.submit')} />
      </div>
    </Form>
  );
}
