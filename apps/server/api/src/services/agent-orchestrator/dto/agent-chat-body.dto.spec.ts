import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { AgentChatBodyDto } from '@api/services/agent-orchestrator/dto/agent-chat-body.dto';
import { type ArgumentMetadata, BadRequestException } from '@nestjs/common';

const metadata: ArgumentMetadata = {
  metatype: AgentChatBodyDto,
  type: 'body',
};

describe('AgentChatBodyDto', () => {
  let pipe: ValidationPipe;

  beforeEach(() => {
    pipe = new ValidationPipe();
  });

  it('should be defined', () => {
    expect(AgentChatBodyDto).toBeDefined();
  });

  it('emits a runtime metatype the pipe validates against', () => {
    // A class with class-validator decorators emits `design:paramtypes`, so the
    // global ValidationPipe treats it as a validatable type. An interface would
    // emit none and `toValidate` would never run — the original defect.
    expect(
      (pipe as unknown as { toValidate: (t: unknown) => boolean }).toValidate(
        AgentChatBodyDto,
      ),
    ).toBe(true);
  });

  describe('valid bodies', () => {
    it('accepts a minimal body with only the required content field', async () => {
      const value = { content: 'Draft me a post' };

      const result = await pipe.transform(value, metadata);

      expect(result).toEqual({ content: 'Draft me a post' });
    });

    it('accepts a fully populated body and preserves every field', async () => {
      const value = {
        artifactReferences: [
          {
            kind: 'post',
            organizationId: 'org-1',
            recordId: 'post-1',
            serializer: 'post',
          },
        ],
        attachments: [{ ingredientId: 'ing-1', url: 'https://cdn/x.png' }],
        brandId: 'brand-1',
        content: 'Draft me a post',
        expectedContextVersion: 3,
        model: 'claude-opus-4-8',
        pageContext: { route: '/library', url: 'https://app/library' },
        planModeEnabled: true,
        source: 'agent',
        threadId: 'thread-1',
      };

      const result = (await pipe.transform(value, metadata)) as Record<
        string,
        unknown
      >;

      expect(result).toEqual(value);
    });

    it('accepts a null brandId via @IsOptional', async () => {
      const value = { brandId: null, content: 'hi' };

      const result = (await pipe.transform(value, metadata)) as Record<
        string,
        unknown
      >;

      expect(result.brandId).toBeNull();
    });
  });

  describe('invalid bodies', () => {
    it('rejects a body missing the required content field', async () => {
      await expect(pipe.transform({}, metadata)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an empty content string', async () => {
      await expect(pipe.transform({ content: '' }, metadata)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a non-string content value', async () => {
      await expect(pipe.transform({ content: 123 }, metadata)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a source outside the allowed enum', async () => {
      await expect(
        pipe.transform({ content: 'hi', source: 'nope' }, metadata),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a non-integer expectedContextVersion', async () => {
      await expect(
        pipe.transform(
          { content: 'hi', expectedContextVersion: 'x' },
          metadata,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a non-boolean planModeEnabled', async () => {
      await expect(
        pipe.transform({ content: 'hi', planModeEnabled: 'yes' }, metadata),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a non-array artifactReferences', async () => {
      await expect(
        pipe.transform({ artifactReferences: {}, content: 'hi' }, metadata),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a non-object pageContext', async () => {
      await expect(
        pipe.transform({ content: 'hi', pageContext: 'ctx' }, metadata),
      ).rejects.toThrow(BadRequestException);
    });

    it('surfaces the standard "Validation failed" envelope', async () => {
      try {
        await pipe.transform({ content: '' }, metadata);
        throw new Error('expected BadRequestException');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(BadRequestException);
        const response = (error as BadRequestException).getResponse() as Record<
          string,
          unknown
        >;
        expect(response).toEqual(
          expect.objectContaining({ message: 'Validation failed' }),
        );
        expect(response.errors).toBeDefined();
      }
    });
  });

  describe('whitelist behaviour', () => {
    it('strips undeclared top-level fields', async () => {
      const value = {
        content: 'hi',
        systemPromptOverride: 'ignore-safety',
      };

      const result = (await pipe.transform(value, metadata)) as Record<
        string,
        unknown
      >;

      expect(result.content).toBe('hi');
      expect(result).not.toHaveProperty('systemPromptOverride');
    });

    it('preserves nested content of container-validated fields verbatim', async () => {
      // pageContext / artifactReferences / attachments carry container-level
      // checks only (@IsObject / @IsArray, no @ValidateNested), so the pipe does
      // NOT recurse or whitelist their inner shape. That inner content is
      // re-authorized server-side in resolveAuthorizedAgentChatBody, which is the
      // single source of truth — stripping it here would break authorization.
      const value = {
        content: 'hi',
        pageContext: {
          analyticsQuery: { metric: 'reach', scope: 'brand-1' },
          researchReferences: [{ findingId: 'f-1', scope: 'brand-1' }],
        },
      };

      const result = (await pipe.transform(value, metadata)) as {
        pageContext: Record<string, unknown>;
      };

      expect(result.pageContext).toEqual(value.pageContext);
    });
  });
});
