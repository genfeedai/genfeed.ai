packages: contracts, hooks

Remove unused abort helpers `useAbortControllerEnhanced`,
`useMultipleAbortControllers`, `withAbortSignal`, `useCombinedAbortSignal` and
`withAbortAndTimeout`, together with orphaned `IAbortControllerConfig` and
`IUseAbortController` types. Existing supported callers use `useAbortController`
and `isAbortError`, which retain their behavior. Consumers of the removed wrappers
should use the retained hook or native AbortController/AbortSignal APIs.
