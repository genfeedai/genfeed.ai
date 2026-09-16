packages: @genfeedai/services

Read the retry contract a classified subscription failure carries in its
JSON:API error `meta` (#4826).

- `@genfeedai/services`: add `getJsonApiErrorMetaNumber(error, key)` and
  `getJsonApiErrorMetaBoolean(error, key)` in `./core/json-api-error-message`.
  Each returns one named primitive, or `undefined` when the key is absent or
  holds another type.

`getJsonApiErrorMember` still drops `meta` wholesale, because a server may put
personal data in it, and these readers are deliberately narrower rather than a
relaxation of that: the `meta` object never escapes, and a caller only receives
the single primitive it named. Existing callers are unaffected.
