'use client';

import type { SkillVersionsPanelProps } from '@props/settings/skills.props';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';

export default function SkillVersionsPanel({
  items,
  detail,
  hasLoaded,
  hasMore,
  isLoading,
  isDisabled,
  error,
  onLoad,
  onLoadOlder,
  onView,
}: SkillVersionsPanelProps) {
  const translate = useTranslations('common.settings.skills');
  const blocked = isLoading || isDisabled;
  return (
    <InsetSurface density="compact">
      <section
        aria-label={translate('versions.title')}
        className="grid gap-3"
        aria-busy={isLoading}
      >
        <h3 className="text-sm font-medium">{translate('versions.title')}</h3>
        <Button
          label={translate(isLoading ? 'versions.loading' : 'versions.load')}
          isDisabled={blocked}
          onClick={() => {
            if (!blocked) onLoad();
          }}
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {hasLoaded && !items.length && !error ? (
          <p className="text-sm text-muted-foreground">
            {translate('versions.empty')}
          </p>
        ) : null}
        {items.length ? (
          <ul className="grid gap-3">
            {items.map((item) => (
              <li key={item.id} className="grid gap-1">
                <span className="text-sm font-medium">
                  {translate('versions.version', {
                    versionNumber: item.versionNumber,
                  })}
                </span>
                <time
                  dateTime={item.createdAt}
                  className="text-xs text-muted-foreground"
                >
                  {item.createdAt}
                </time>
                <span className="break-all font-mono text-xs text-muted-foreground">
                  {item.contentHash}
                </span>
                <Button
                  label={translate('versions.view', {
                    versionNumber: item.versionNumber,
                  })}
                  isDisabled={blocked}
                  onClick={() => {
                    if (!blocked) onView(item.id);
                  }}
                />
              </li>
            ))}
          </ul>
        ) : null}
        {hasMore ? (
          <Button
            label={translate('versions.older')}
            isDisabled={blocked}
            onClick={() => {
              if (!blocked) onLoadOlder();
            }}
          />
        ) : null}
        {detail ? (
          <div className="grid gap-2">
            <h4 className="text-sm font-medium">
              {translate('versions.version', {
                versionNumber: detail.versionNumber,
              })}
            </h4>
            {detail.instructionText === '' ? (
              <p className="text-sm text-muted-foreground">
                {translate('versions.emptyInstructions')}
              </p>
            ) : null}
            <section aria-label={translate('versions.instructions')}>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm">
                {detail.instructionText}
              </pre>
            </section>
          </div>
        ) : null}
      </section>
    </InsetSurface>
  );
}
