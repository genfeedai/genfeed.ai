'use client';

import type { ITrendPlaybook } from '@genfeedai/interfaces';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';

type PlatformConfigEntry = {
  icon?: React.ComponentType<{ className?: string }>;
  label?: string;
};

type Props = {
  playbooks: ITrendPlaybook[];
  platformConfigLookup: Record<string, PlatformConfigEntry>;
};

export default function PlaybookSection({
  playbooks,
  platformConfigLookup,
}: Props) {
  if (playbooks.length === 0) {
    return null;
  }

  return (
    <section>
      <Card
        className="border border-white/[0.08] bg-card/80 backdrop-blur"
        bodyClassName="space-y-6"
      >
        <VStack gap={2}>
          <Heading size="xl">Viral format playbook</Heading>
          <Text as="p" size="sm" color="subtle-60">
            Repeatable storytelling patterns pulled from today&apos;s winning
            videos.
          </Text>
        </VStack>
        <ul className="space-y-4">
          {playbooks.map((pattern: ITrendPlaybook) => (
            <li
              key={pattern.id}
              className=" border border-white/[0.08] bg-card/70 p-4"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <h3 className="font-semibold text-foreground">
                    {pattern.title}
                  </h3>
                  <p className="text-sm text-foreground/60">
                    {pattern.description}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {pattern.platforms.map((platformId: string) => {
                    const platform = platformConfigLookup[platformId];

                    if (!platform) {
                      return null;
                    }

                    const Icon = platform.icon;

                    return (
                      <Badge
                        key={`${pattern.id}-${platformId}`}
                        className="bg-transparent text-xs border border-white/[0.08] text-[10px] uppercase tracking-wide"
                      >
                        <span className="flex items-center gap-2">
                          {Icon && <Icon className="text-sm" />}
                          {platform.label}
                        </span>
                      </Badge>
                    );
                  })}
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-foreground/60">
                Action: {pattern.action}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
