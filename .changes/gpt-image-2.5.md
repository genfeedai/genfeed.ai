packages: helpers pages pricing props

Add GPT Image 2.5 Flare/Sunburst and a native OpenAPI `quality` field on the
shared generation setup.

- `props`: `GenerationSetupLookFieldKey` now includes `quality`.
- `pages`: Studio setup bridge forwards the model quality enum.
- `helpers`: image-quality helper maps OpenAPI quality onto provider payloads.
- `pricing`: GPT Image 2.5 Flare and Sunburst catalog rows.

Existing generation-setup consumers keep compiling; `quality` is optional and
empty still means the model default.
