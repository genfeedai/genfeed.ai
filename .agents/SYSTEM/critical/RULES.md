# Coding Rules & Standards

Mandatory coding standards for Genfeed development. For cross-repo rules (no `any`, no `console.log`, path aliases, conventional commits), see `CLAUDE.md`.

## TypeScript Standards

- Interfaces: component props -> `packages/props/[category]/*.props.ts`, state/helpers -> `packages/interfaces/[category]/*.interface.ts`
- Use `type` for unions/intersections/primitives, `interface` for object shapes/classes
- Strict null checks -- handle null/undefined explicitly
- Booleans: `is[Property]` or `has[Property]` prefix always (`isActive`, `hasPermission`)

## Naming Conventions

- Files: `kebab-case.ts`
- Components: `PascalCase.tsx`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Event handlers: `handle` + Action (`handleClick`, `handleSubmit`)
- Services: end with `Service`, Props: end with `Props`

## Function Declaration

- Frontend components: `function` declaration with default export (NOT arrow functions)
- Event handlers: `const` with arrow function
- Services/utilities: named `function` export
- Singletons: private constructor + `getInstance()`

## Error Handling

- **Backend (NestJS):** NestJS exceptions (`NotFoundException`, `BadRequestException`). Log with `this.logger.error()`
- **Frontend:** try/catch with `LoggerService.getInstance().error()`. AbortController in every useEffect async

## Testing Standards

- Scoped tests only: `bun test path/to/file.spec.ts`
- Minimum 70% coverage for new code, 100% for auth/payments/data mutations
- Descriptive test names: `it('should create a feature with valid data')`

## Performance

- Code splitting with `next/dynamic` for heavy components
- `memo`, `useMemo`, `useCallback` for expensive operations
- Input validation with `class-validator` DTOs (backend)
