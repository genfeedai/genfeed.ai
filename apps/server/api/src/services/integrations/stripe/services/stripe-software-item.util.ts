interface PricedItem {
  price: { id: string; metadata?: Record<string, string> | null };
}
interface ItemSubscription<T> {
  metadata?: Record<string, string> | null;
  items: { has_more?: boolean; data: T[] };
}

/** Signed Stripe price metadata permits negotiated software prices without using their amount as an entitlement. */
export function selectSoftwareSubscriptionItem<T extends PricedItem>(
  subscription: ItemSubscription<T>,
  configuredPriceIds: ReadonlyArray<string | undefined> = [],
) {
  if (subscription.metadata?.billing_scope === 'service') return null;
  if (subscription.items.has_more)
    throw new Error('Incomplete subscription items');
  if (!subscription.items?.data?.length) return undefined;
  const candidates = subscription.items.data.filter(
    (item) =>
      configuredPriceIds.some((id) => Boolean(id) && id === item.price.id) ||
      ((item.price.metadata?.genfeed_software_tier === 'scale' ||
        item.price.metadata?.genfeed_software_tier === 'pro') &&
        Number.isInteger(
          Number(item.price.metadata?.included_monthly_credits),
        ) &&
        Number(item.price.metadata?.included_monthly_credits) > 0),
  );
  if (candidates.length > 1)
    throw new Error('Multiple software items are ambiguous');
  if (candidates.length === 1) return candidates[0];
  // Preserve older one-product subscriptions; never guess among multiple products.
  if (
    subscription.items.data.length === 1 &&
    !subscription.metadata?.billing_scope
  )
    return subscription.items.data[0];
  throw new Error('Software subscription item is missing');
}

export function requireSoftwareSubscriptionItem<T extends PricedItem>(
  subscription: ItemSubscription<T>,
  configuredPriceIds: ReadonlyArray<string | undefined>,
) {
  const item = selectSoftwareSubscriptionItem(subscription, configuredPriceIds);
  if (item === undefined) throw new Error('No subscription items found');
  if (!item)
    throw new Error('A service subscription has no software plan to change');
  return item;
}
