import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { IS_PUBLIC_KEY } from '@libs/decorators/public.decorator';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';

describe('ClerkGuard', () => {
  let guard: ClerkGuard;
  let reflector: vi.Mocked<Reflector>;

  const mockExecutionContext = {
    getClass: vi.fn(),
    getHandler: vi.fn(),
  } as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClerkGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: vi.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<ClerkGuard>(ClerkGuard);
    reflector = module.get(Reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should return true for public routes', () => {
      reflector.getAllAndOverride.mockReturnValue(true);

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
        mockExecutionContext.getHandler(),
        mockExecutionContext.getClass(),
      ]);
    });

    it('should call super.canActivate for protected routes', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const parentPrototype = Object.getPrototypeOf(
        Object.getPrototypeOf(guard),
      );
      const superCanActivateSpy = vi
        .spyOn(parentPrototype, 'canActivate')
        .mockReturnValue(true);

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(superCanActivateSpy).toHaveBeenCalledWith(mockExecutionContext);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
        mockExecutionContext.getHandler(),
        mockExecutionContext.getClass(),
      ]);

      superCanActivateSpy.mockRestore();
    });

    it('should call super.canActivate when isPublic is undefined', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      const parentPrototype = Object.getPrototypeOf(
        Object.getPrototypeOf(guard),
      );
      const superCanActivateSpy = vi
        .spyOn(parentPrototype, 'canActivate')
        .mockReturnValue(true);

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(superCanActivateSpy).toHaveBeenCalledWith(mockExecutionContext);

      superCanActivateSpy.mockRestore();
    });

    it('should call super.canActivate when isPublic is false', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const parentPrototype = Object.getPrototypeOf(
        Object.getPrototypeOf(guard),
      );
      const superCanActivateSpy = vi
        .spyOn(parentPrototype, 'canActivate')
        .mockReturnValue(false);

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
      expect(superCanActivateSpy).toHaveBeenCalledWith(mockExecutionContext);

      superCanActivateSpy.mockRestore();
    });
  });
});
