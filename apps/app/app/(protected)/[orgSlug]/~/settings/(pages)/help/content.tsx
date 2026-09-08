'use client';

// biome-ignore assist/source/organizeImports: Keep external imports before workspace aliases.
import {
  BookOpen,
  CircleHelp,
  ExternalLink,
  FileText,
  LifeBuoy,
  MessagesSquare,
  Play,
  Rocket,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { isSelfHostedDeployment } from '@genfeedai/config/deployment';
import { APP_ROUTES } from '@genfeedai/contracts/constants';

import { getHelpResources } from '@app-config/help-resources.config';
import type { HelpResourceCardProps } from '@props/settings/help-content.props';
import Card from '@ui/card/Card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@ui/primitives/accordion';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { LinkCard } from '@/components/ui/link-card';

const RESOURCE_ICONS = {
  gettingStarted: Rocket,
  documentation: BookOpen,
  workflows: Play,
  changelog: FileText,
  faq: CircleHelp,
  community: MessagesSquare,
  support: LifeBuoy,
};

function HelpResourceCard({ resource, selfHosted }: HelpResourceCardProps) {
  const translate = useTranslations('pages.help');
  const description = translate(
    selfHosted &&
      (resource.id === 'support' || resource.id === 'gettingStarted')
      ? `resources.${resource.id}.selfHosted`
      : `resources.${resource.id}.description`,
  );
  const title = translate(`resources.${resource.id}.title`);

  return (
    <section
      aria-labelledby={`help-${resource.id}`}
      className="flex flex-col gap-3"
    >
      <Heading as="h2" id={`help-${resource.id}`} size="md">
        {title}
      </Heading>
      {resource.url ? (
        <LinkCard
          href={resource.url}
          icon={RESOURCE_ICONS[resource.id]}
          title={title}
          description={description}
          className="h-full p-4 no-underline text-sm"
          trailingIcon={
            <>
              <ExternalLink
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
              <Text className="sr-only">{translate('external')}</Text>
            </>
          }
        />
      ) : (
        <Card bodyClassName="gap-2 p-4" className="h-full">
          <Text as="p" size="sm">
            {description}
          </Text>
          <Text as="p" size="sm" color="muted">
            {selfHosted && resource.id === 'support'
              ? translate('resources.support.unavailable')
              : `${translate('unavailable')}. ${translate('unavailableGuidance')}`}
          </Text>
        </Card>
      )}
    </section>
  );
}

export default function SettingsHelpPage() {
  const translate = useTranslations('pages.help');
  const selfHosted = isSelfHostedDeployment();
  const resources = getHelpResources(selfHosted);

  return (
    <div className="flex flex-col gap-8 pb-8">
      <div className="space-y-2">
        <Heading as="h1" size="lg">
          {translate('title')}
        </Heading>
        <Text as="p" color="muted" size="sm">
          {translate('description')}
        </Text>
      </div>
      <section aria-labelledby="help-learning-path" className="space-y-3">
        <Heading as="h2" id="help-learning-path" size="md">
          {translate('learningPath')}
        </Heading>
        <div className="grid gap-3 md:grid-cols-3">
          {(['brand', 'create', 'review'] as const).map((step) => (
            <Card key={step} bodyClassName="gap-2 p-4">
              <Heading as="h3" size="sm">
                {translate(`steps.${step}.title`)}
              </Heading>
              <Text as="p" color="muted" size="sm">
                {translate(`steps.${step}.description`)}
              </Text>
            </Card>
          ))}
        </div>
      </section>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {resources.map((resource) => (
          <HelpResourceCard
            key={resource.id}
            resource={resource}
            selfHosted={selfHosted}
          />
        ))}
      </div>
      <section
        id="characters"
        aria-labelledby="help-characters"
        className="scroll-mt-20 space-y-3"
      >
        <Heading as="h2" id="help-characters" size="md">
          {translate('answersTitle')}
        </Heading>
        <Accordion type="single" collapsible>
          {(['create', 'save', 'reuse'] as const).map((answer) => (
            <AccordionItem key={answer} value={answer}>
              <AccordionTrigger className="text-left text-sm">
                {translate(`answers.${answer}.question`)}
              </AccordionTrigger>
              <AccordionContent>
                <Text as="p" color="muted" size="sm">
                  {translate(`answers.${answer}.answer`)}
                </Text>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
      <div className="space-y-2">
        <Text as="p" color="muted" size="sm">
          {translate('buildDetails')}
        </Text>
        <Link
          href={APP_ROUTES.SETTINGS.ABOUT}
          className="inline-flex text-sm underline underline-offset-4"
        >
          {translate('about')}
        </Link>
      </div>
    </div>
  );
}
