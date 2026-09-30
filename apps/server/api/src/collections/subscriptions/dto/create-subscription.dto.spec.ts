import { CreateSubscriptionDto } from '@api/collections/subscriptions/dto/create-subscription.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCheckoutSessionDto } from './create-subscription.dto';

describe('CreateSubscriptionDto', () => {
  it('should be defined', () => {
    expect(CreateSubscriptionDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateSubscriptionDto();
      expect(dto).toBeInstanceOf(CreateSubscriptionDto);
    });
  });
});

describe('CreateCheckoutSessionDto — quantity validation', () => {
  it('fails validation when quantity is below the minimum', async () => {
    const instance = plainToInstance(CreateCheckoutSessionDto, {
      quantity: 500,
      stripePriceId: 'price_abc123',
    });

    const errors = await validate(instance);
    const quantityError = errors.find((error) => error.property === 'quantity');

    expect(quantityError).toBeDefined();
    expect(Object.keys(quantityError?.constraints ?? {})).toContain('min');
  });

  it('passes validation when quantity is at or above the minimum', async () => {
    const instance = plainToInstance(CreateCheckoutSessionDto, {
      quantity: 1500,
      stripePriceId: 'price_abc123',
    });

    const errors = await validate(instance);

    expect(errors.some((error) => error.property === 'quantity')).toBe(false);
  });

  it('passes validation when quantity is omitted', async () => {
    const instance = plainToInstance(CreateCheckoutSessionDto, {
      stripePriceId: 'price_abc123',
    });

    const errors = await validate(instance);

    expect(errors.some((error) => error.property === 'quantity')).toBe(false);
  });

  it('coerces numeric string quantity before validation', async () => {
    const instance = plainToInstance(CreateCheckoutSessionDto, {
      quantity: '1500',
      stripePriceId: 'price_abc123',
    });

    const errors = await validate(instance);

    expect(errors.some((error) => error.property === 'quantity')).toBe(false);
    expect(instance.quantity).toBe(1500);
  });
});
