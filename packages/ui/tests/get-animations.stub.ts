// jsdom has no Web Animations API. ui-sdk waits for an element's animations to
// finish before it removes a part, like a radio's indicator, so a spec that
// renders those controls needs an element with no animations to wait on.
if (typeof Element !== 'undefined' && !Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => [];
}
