import type { PlatformSettingsGroupProps } from '@props/admin/platform-settings.props';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';

/** A titled stack of fields inside one platform settings tab. */
export default function PlatformSettingsGroup({
  children,
  description,
  title,
}: PlatformSettingsGroupProps) {
  return (
    <section className="flex flex-col gap-4">
      {title || description ? (
        <div className="flex flex-col gap-1">
          {title ? <Heading size="sm">{title}</Heading> : null}
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
