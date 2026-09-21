import { NULL_TYPED_DECISION_PROVIDER_NAME } from '@api/services/typed-decisions/typed-decisions.constants';
import type {
  TypedDecisionAnswer,
  TypedDecisionBooleanParams,
  TypedDecisionChoiceParams,
  TypedDecisionProvider,
  TypedDecisionScoreParams,
} from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

/**
 * The self-hosted default (#4864): no vendor, no key, no network. Every call
 * resolves `null`, which every call site already has to treat exactly like a
 * sub-threshold confidence — so a self-host install keeps its deterministic
 * behaviour on every migrated decision point.
 */
@Injectable()
export class NullTypedDecisionProvider implements TypedDecisionProvider {
  readonly name = NULL_TYPED_DECISION_PROVIDER_NAME;

  async choose<TOption extends string>(
    _params: TypedDecisionChoiceParams<TOption>,
  ): Promise<TypedDecisionAnswer<TOption> | null> {
    return null;
  }

  async score(
    _params: TypedDecisionScoreParams,
  ): Promise<TypedDecisionAnswer<number> | null> {
    return null;
  }

  async decide(
    _params: TypedDecisionBooleanParams,
  ): Promise<TypedDecisionAnswer<boolean> | null> {
    return null;
  }
}
