'use client';

import { ComponentSize } from '@genfeedai/enums';
import type { TemplateVariable } from '@genfeedai/interfaces/content/template-ui.interface';
import { Code } from '@genfeedai/ui';
import Badge from '@ui/display/badge/Badge';
import { VStack } from '@ui/layout/stack';
import { Text } from '@ui/typography/text';
import { DetailCard } from './template-detail-helpers';

type Props = {
  variables: TemplateVariable[];
};

export default function TemplateVariablesCard({ variables }: Props) {
  if (variables.length === 0) {
    return null;
  }

  return (
    <DetailCard title="Variables">
      <VStack gap={4}>
        {variables.map((variable) => (
          <div
            key={variable.id}
            className="border-b border-white/[0.08] pb-4 last:border-b-0 last:pb-0"
          >
            <div className="flex items-center gap-2 mb-2">
              <Code size="md" className="bg-background">
                {`{{${variable.name}}}`}
              </Code>
              <Badge variant="outline" size={ComponentSize.SM}>
                {variable.type}
              </Badge>
              {variable.required && (
                <Badge variant="error" size={ComponentSize.SM}>
                  Required
                </Badge>
              )}
            </div>
            {variable.label && (
              <Text as="p" size="sm" weight="medium" className="mb-1">
                {variable.label}
              </Text>
            )}
            {variable.description && (
              <Text as="p" size="sm" color="subtle-70" className="mb-2">
                {variable.description}
              </Text>
            )}
            {variable.defaultValue !== undefined && (
              <Text as="p" size="xs" color="subtle-60">
                Default: <Code>{String(variable.defaultValue)}</Code>
              </Text>
            )}
            {variable.validation && (
              <Text as="div" size="xs" color="subtle-60" className="mt-2">
                {variable.validation.min !== undefined && (
                  <span>Min: {variable.validation.min} </span>
                )}
                {variable.validation.max !== undefined && (
                  <span>Max: {variable.validation.max} </span>
                )}
                {variable.validation.pattern && (
                  <span>Pattern: {variable.validation.pattern}</span>
                )}
              </Text>
            )}
            {variable.options && variable.options.length > 0 && (
              <div className="mt-2">
                <Text as="p" size="xs" color="subtle-60" className="mb-1">
                  Options:
                </Text>
                <div className="flex flex-wrap gap-2">
                  {variable.options.map((option) => (
                    <Badge
                      key={String(option.value)}
                      variant="ghost"
                      size={ComponentSize.SM}
                    >
                      {option.label} ({option.value})
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </VStack>
    </DetailCard>
  );
}
