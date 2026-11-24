---
name: article-images
description: An article image is a permanent public URL made by complete_media_upload with publicImage; Library URLs are signed and article HTML drops SVG and data URIs
type: reference
---

An article's cover (`coverImageUrl`) and inline `<img src>` must be permanent, unsigned https URLs. Library media is delivered through short-lived signed grants, and `sanitizeHtml` (`packages/helpers/src/security/sanitize-html.helper.ts`) removes `<svg>` and refuses `data:` URLs, so neither works.

**How to apply:**
- An agent uploads the image with `upload_media` (request, PUT, complete) and completes it with `publicImage: true`. `PresignedUploadService.confirmPublicImageUpload` confirms the upload, then copies the object to `assets/articles/<organizationId>/<ingredientId>.<ext>` and returns `publicUrl` (`https://cdn.genfeed.ai/...`).
- It only publishes the upload the caller is completing: the pending ingredient is looked up by organization and user, so another tenant's asset or one already in the Library cannot be made public. Only PNG, JPEG, WebP and GIF; Cloud only.
- Never add a route that makes an existing Library asset public for an article without the same scoped lookup and a spec that a private asset never reaches the public path (`presigned-upload.service.spec.ts`, `confirmPublicImageUpload`).
- After an `article_update`, fetch the public page and check the image renders; the page is ISR-cached for a few minutes.

**Why:** a rewrite of a token pricing article had its three charts stripped by the sanitizer, and no tool could host a permanent cover (#11188).
