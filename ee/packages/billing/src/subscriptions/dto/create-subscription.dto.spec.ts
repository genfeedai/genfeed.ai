import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateCheckoutSessionDto,
  CreateSubscriptionDto,
} from './create-subscription.dto';

describe('CreateSubscriptionDto', () => {
  it('should be defined', () => {
    expect(CreateSubscriptionDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateSubscriptionDto();
      expect(dto).toBeInstanceOf(CreateSubscriptionDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateSubscriptionDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});

describe('CreateCheckoutSessionDto — quantity validation', () => {
  it('should fail validation when quantity (500) is below minimum (1000)', async () => {
    const instance = plainToInstance(CreateCheckoutSessionDto, {
      stripePriceId: 'price_abc123',
      quantity: 500,
    });
    const errors = await validate(instance);
    expect(errors.length).toBeGreaterThan(0);
    const quantityError = errors.find((e) => e.property === 'quantity');
    expect(quantityError).toBeDefined();
    expect(Object.keys(quantityError!.constraints ?? {})).toContain('min');
  });

  it('should pass validation when quantity is at or above minimum (1500)', async () => {
    const instance = plainToInstance(CreateCheckoutSessionDto, {
      stripePriceId: 'price_abc123',
      quantity: 1500,
    });
    const errors = await validate(instance);
    const quantityErrors = errors.filter((e) => e.property === 'quantity');
    expect(quantityErrors.length).toBe(0);
  });

  it('should pass validation when quantity is omitted (field is optional)', async () => {
    const instance = plainToInstance(CreateCheckoutSessionDto, {
      stripePriceId: 'price_abc123',
    });
    const errors = await validate(instance);
    const quantityErrors = errors.filter((e) => e.property === 'quantity');
    expect(quantityErrors.length).toBe(0);
  });

  it('should coerce string "1500" to number 1500 via @Type(() => Number) and pass validation', async () => {
    const instance = plainToInstance(CreateCheckoutSessionDto, {
      stripePriceId: 'price_abc123',
      quantity: '1500',
    });
    const errors = await validate(instance);
    const quantityErrors = errors.filter((e) => e.property === 'quantity');
    expect(quantityErrors.length).toBe(0);
    expect(instance.quantity).toBe(1500);
  });
});
