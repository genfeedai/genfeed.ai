# MCP Controller Architecture

## Design Principles

### ⚠️ CRITICAL RULE: Never Export Controllers

**Controllers should NEVER be exported from modules or injected into other controllers.**

```typescript
// ❌ BAD - Never do this
@Module({
  exports: [SomeController], // WRONG!
})

// ❌ BAD - Never inject controllers
constructor(private readonly someController: SomeController) {}

// ✅ GOOD - Only export services
@Module({
  exports: [SomeService],
})

// ✅ GOOD - Only inject services
constructor(private readonly someService: SomeService) {}
```

### Why This Rule Exists

1. **Separation of Concerns**: Controllers handle HTTP concerns (routing, guards, interceptors). Services handle business logic.
2. **Dependency Graph**: Controllers depend on services, not other controllers. Injecting controllers creates circular dependencies.
3. **Testing**: Services are easier to test in isolation than controllers.
4. **Maintainability**: Service-to-service communication is clearer than controller-to-controller.

### Current Implementation

The MCPController currently uses services directly:

```typescript
@Controller('mcp')
export class MCPController {
  constructor(
    private readonly videosService: VideosService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Post('videos')
  async createVideo(@Body() createVideoDto: CreateVideoDto) {
    return this.videosService.create(createVideoDto);
  }
}
```

### Problem: Complex Business Logic

The VideosController.create() method has 300+ lines of orchestration code between 16 different services:

- BrandsService
- PromptsService
- IngredientsService
- MetadataService
- AssetsService
- SharedService
- KlingAIService
- ReplicateService
- ModelsService
- CreditsUtilsService
- FailedGenerationService
- BookmarksService
- And more...

**This orchestration logic doesn't belong in a controller, but it also doesn't belong in a single service.**

### Recommended Solution: Use Case Pattern

Create a dedicated use case/command handler for complex operations:

```typescript
// video-generation.use-case.ts
@Injectable()
export class VideoGenerationUseCase {
  constructor(
    private readonly brandsService: BrandsService,
    private readonly promptsService: PromptsService,
    private readonly videosService: VideosService,
    private readonly metadataService: MetadataService,
    // ... all other services
  ) {}

  async execute(dto: CreateVideoDto, user: User): Promise<VideoEntity> {
    // All the complex orchestration logic here
    // 300+ lines of business logic
  }
}

// mcp.controller.ts
@Controller('mcp')
export class MCPController {
  constructor(
    private readonly videoGenerationUseCase: VideoGenerationUseCase,
  ) {}

  @Post('videos')
  async createVideo(
    @Body() createVideoDto: CreateVideoDto,
    @CurrentUser() user: User,
  ) {
    return this.videoGenerationUseCase.execute(createVideoDto, user);
  }
}
```

### Benefits of Use Case Pattern

1. ✅ No controller exports needed
2. ✅ Complex orchestration is properly encapsulated
3. ✅ Easy to test business logic separately from HTTP concerns
4. ✅ Can be reused by multiple controllers (VideosController, MCPController, etc.)
5. ✅ Follows SOLID principles (Single Responsibility)
6. ✅ Clear separation: Controllers → Use Cases → Services → Data

### TODO

- [ ] Extract video generation logic into `VideoGenerationUseCase`
- [ ] Extract analytics aggregation logic into `AnalyticsAggregationUseCase`
- [ ] Update MCPController to use use cases instead of services directly
- [ ] Document this pattern in main architecture docs
