import type { ReviewSourceFiltersProps } from '@props/publishing/review-inbox-approvals.props';
import DropdownMultiSelect from '@ui/dropdowns/multiselect/DropdownMultiSelect';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { PUBLISH_HEADER_DROPDOWN_CLASS } from './ReviewStatusFilters';
import {
  REVIEW_INBOX_SOURCE_MESSAGE_KEYS,
  REVIEW_INBOX_SOURCES,
} from './review-inbox.helpers';

/**
 * Who is asking: agent drafts and agent-run gates, plain workflow gates, or an
 * MCP client. Empty selection = every source.
 */
export default function ReviewSourceFilters({
  activeSources,
  onSourceChange,
}: ReviewSourceFiltersProps) {
  const translate = useTranslations('pages.publishing.review.inbox');
  const options = useMemo(
    () =>
      REVIEW_INBOX_SOURCES.map((source) => ({
        label: translate(REVIEW_INBOX_SOURCE_MESSAGE_KEYS[source]),
        value: source,
      })),
    [translate],
  );

  return (
    <DropdownMultiSelect
      className={PUBLISH_HEADER_DROPDOWN_CLASS}
      name="review-source"
      onChange={(_name, values) => {
        onSourceChange(
          REVIEW_INBOX_SOURCES.filter((source) => values.includes(source)),
        );
      }}
      options={options}
      placeholder={translate('allSources')}
      values={[...activeSources]}
    />
  );
}
