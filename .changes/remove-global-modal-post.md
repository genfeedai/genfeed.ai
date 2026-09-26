packages: contexts

The global modals provider no longer mounts `ModalPost`. `useGlobalModalsState`
drops `handlePostConfirm` and `handlePostCreated`, and `GlobalModalsRenderer`
no longer renders `LazyModalPost`. Post creation opens the full-page publishing
composer instead; nothing opened the global `ModalEnum.POST` instance.
