import { useEffect } from 'react';

/** Asks before leaving the page or the brand while the revision has unsaved edits. */
export function useBrandOsDirtyNavigation(
  brandId: string,
  dirty: boolean,
  t: (key: 'confirmLeave') => string,
) {
  // use-effect-audit: ignore subscribes to browser events
  useEffect(() => {
    if (!dirty) return;
    function preventUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    function confirmNavigation(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest('a[href]');
      const button = target.closest('button[data-brand-os-navigation]');
      const navigation =
        (link &&
          link.getAttribute('target') !== '_blank' &&
          !link.hasAttribute('download')) ||
        (button instanceof HTMLButtonElement &&
          !button.disabled &&
          button.getAttribute('data-brand-os-navigation') === brandId);
      if (navigation && !window.confirm(t('confirmLeave'))) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    }
    window.addEventListener('beforeunload', preventUnload);
    document.addEventListener('click', confirmNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', preventUnload);
      document.removeEventListener('click', confirmNavigation, true);
    };
  }, [brandId, dirty, t]);
}
