import type { PlatformSettingsGroupProps } from '@props/admin/platform-settings.props';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { useId } from 'react';

/**
 * A titled stack of fields inside one platform settings tab. The title names
 * the region, so the fields inside keep short labels ("Mode", "Min
 * confidence") without losing their context.
 */
export default function PlatformSettingsGroup({
  children,
  description,
  title,
}: PlatformSettingsGroupProps) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={title ? titleId : undefined}
      className="flex flex-col gap-4"
    >
      {title || description ? (
        <div className="flex flex-col gap-1">
          {title ? (
            <Heading id={titleId} size="sm">
              {title}
            </Heading>
          ) : null}
          {description ? (
            <Text as="p" color="muted" size="sm">
              {description}
            </Text>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
