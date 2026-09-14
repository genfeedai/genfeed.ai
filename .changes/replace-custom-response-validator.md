packages: @genfeedai/services @genfeedai/utils

BaseService responseSchema and itemSchema now accept zod schemas. Subclasses using those extension points must replace custom ValidationSchema objects with equivalent zod schemas. Validation calls parse to reject invalid values; model construction retains the original response object rather than the parsed or transformed value.

Remove imports from `@genfeedai/utils/validation/type-validator.util`; TypeValidator, ValidationSchema, CommonSchemas, and createValidator are removed. Use zod schemas and parse/safeParse at response boundaries, and native JavaScript type checks for primitive guards. Schema validation failures now use ZodError instead of the custom TypeError text.
