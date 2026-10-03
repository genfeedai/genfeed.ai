import type {
  ProviderVerificationItem,
  ProviderVerificationPage,
} from '@api/services/integrations/publishers/interfaces/publish-verification.interface';
import { PROVIDER_VERIFICATION_PAGE_SIZE } from '@api/services/integrations/publishers/publisher-verification.util';
import {
  verificationArray as array,
  verificationId as id,
  verificationInteger as integer,
  verificationPostUrl as postUrl,
  verificationRecord as record,
  verificationResponse as response,
  verificationString as string,
  verificationTimestamp as timestamp,
} from '@api/services/integrations/publishers/publisher-verification-pages.util';

function article(
  externalId: string,
  date: unknown,
  body: unknown,
  title: unknown,
  status: unknown,
  hasMedia: boolean,
): ProviderVerificationItem {
  return {
    id: externalId,
    createdAt: timestamp(date),
    text: string(body),
    title: string(title),
    status: id(status),
    hasMedia,
    isReply: false,
  };
}

function offsetCursor(
  total: number,
  offset: number,
  count: number,
): string | null {
  const next = offset + count;
  if (
    count > PROVIDER_VERIFICATION_PAGE_SIZE ||
    next > total ||
    (count === 0 && next < total) ||
    (next < total && count !== PROVIDER_VERIFICATION_PAGE_SIZE)
  )
    throw new Error('Incomplete article verification pagination');
  return next < total ? String(next) : null;
}

export function parseWordpressVerificationPage(
  value: unknown,
  offset: number,
): ProviderVerificationPage {
  const root = response(value);
  const posts = array(root.posts);
  return {
    items: posts.map((node) => {
      const post = record(node);
      if (typeof post.featured_image !== 'string')
        throw new Error('Incomplete WordPress featured image evidence');
      return article(
        String(integer(post.ID)),
        post.date,
        post.content,
        post.title,
        post.status,
        post.featured_image.length > 0,
      );
    }),
    nextCursor: offsetCursor(integer(root.found), offset, posts.length),
  };
}

export function parseGhostVerificationPage(
  value: unknown,
  page: number,
): ProviderVerificationPage {
  const root = response(value);
  const posts = array(root.posts);
  const paging = record(record(root.meta).pagination);
  if (
    integer(paging.page) !== page ||
    integer(paging.limit) !== PROVIDER_VERIFICATION_PAGE_SIZE
  )
    throw new Error('Ghost verification cursor not honored');
  const cursor = offsetCursor(
    integer(paging.total),
    (page - 1) * PROVIDER_VERIFICATION_PAGE_SIZE,
    posts.length,
  );
  return {
    items: posts.map((node) => {
      const post = record(node);
      if (post.feature_image !== null && typeof post.feature_image !== 'string')
        throw new Error('Incomplete Ghost featured image evidence');
      const result = article(
        id(post.id),
        post.created_at,
        post.html,
        post.title,
        post.status,
        !!post.feature_image,
      );
      result.url = postUrl(post.url);
      return result;
    }),
    nextCursor: cursor === null ? null : String(page + 1),
  };
}

export function parseShopifyVerificationPage(
  value: unknown,
): ProviderVerificationPage {
  const root = response(value);
  const products = record(record(root.data).products);
  const paging = record(products.pageInfo);
  if (typeof paging.hasNextPage !== 'boolean')
    throw new Error('Incomplete Shopify verification pagination');
  return {
    items: array(products.edges).map((edge) => {
      const post = record(record(edge).node);
      if (!['ACTIVE', 'DRAFT'].includes(id(post.status)))
        throw new Error('Shopify verification lifecycle unavailable');
      const result = article(
        id(post.id),
        post.createdAt,
        post.descriptionHtml,
        post.title,
        post.status,
        array(record(post.images).nodes).length > 0,
      );
      result.handle = id(post.handle);
      if (post.onlineStoreUrl !== null)
        result.url = postUrl(post.onlineStoreUrl);
      return result;
    }),
    nextCursor: paging.hasNextPage ? id(paging.endCursor) : null,
  };
}

export function parseBeehiivVerificationPage(
  value: unknown,
  page: number,
  startedAt: Date,
): ProviderVerificationPage {
  const root = response(value);
  const nodes = array(root.data);
  const total = integer(root.total_results);
  if (integer(root.page) !== page)
    throw new Error('Beehiiv verification cursor not honored');
  const next = offsetCursor(
    total,
    (page - 1) * PROVIDER_VERIFICATION_PAGE_SIZE,
    nodes.length,
  );
  const items = nodes.map((node) => {
    const post = record(node);
    const created = integer(post.created) * 1000;
    const item = article(
      id(post.id),
      created,
      record(record(post.content).free).web,
      post.title,
      post.status,
      false,
    );
    item.url = postUrl(
      post.status === 'draft' ? post.preview_url : post.web_url,
    );
    if (post.publish_date !== undefined && post.publish_date !== null)
      item.scheduledAt = timestamp(integer(post.publish_date) * 1000);
    return item;
  });
  // The request explicitly orders by created DESC, which the API documents.
  // Check ordering too; remaining pages are older once this one crosses start.
  if (
    items.some(
      (item, index) => index > 0 && item.createdAt > items[index - 1].createdAt,
    )
  )
    throw new Error('Beehiiv verification ordering was not honored');
  const isWindowCovered =
    items.length > 0 &&
    items[items.length - 1].createdAt.getTime() <
      Math.floor(startedAt.getTime() / 1000) * 1000;
  return {
    items,
    nextCursor: isWindowCovered || next === null ? null : String(page + 1),
  };
}
