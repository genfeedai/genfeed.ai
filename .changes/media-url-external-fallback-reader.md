packages: @genfeedai/libs

`./media/media-url.util` adds `readIngredientMediaUrlWithFallback(row)`: the
media URL of a row read straight from Prisma, its computed `cdnUrl` or, for
keyless external media, the loaded `metadata.result`. Additive; no existing
export changed shape.
