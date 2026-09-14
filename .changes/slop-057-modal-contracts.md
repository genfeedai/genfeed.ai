packages: contracts, contexts, hooks, props, ui

Gallery account selections now use `AccountMediaReference` (`id` and `url`), and
prompt-bar references use `MediaReference` for the metadata available from uploads
and gallery picks. Callers must not assume these reference descriptors contain a
complete asset or image record. Full ingredient selection callbacks retain their
existing model contracts. Prompt-bar gallery options reuse the global modal
configuration contract, and brand link creation sends the canonical `brandId`.
