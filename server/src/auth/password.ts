import { BadRequestException } from '@nestjs/common';
import { registerDecorator } from 'class-validator';

export function validPassword(value: unknown, minimum = 8): value is string {
  return (
    typeof value === 'string' &&
    [...value].length >= minimum &&
    Buffer.byteLength(value, 'utf8') <= 72
  );
}

export function assertPassword(value: unknown, minimum = 8) {
  if (!validPassword(value, minimum))
    throw new BadRequestException(
      `Password must contain at least ${minimum} characters and at most 72 UTF-8 bytes`,
    );
}

export function Password(minimum = 8): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'password',
      target: target.constructor,
      propertyName: String(propertyKey),
      validator: {
        validate: (value: unknown) => validPassword(value, minimum),
        defaultMessage: () =>
          `Password must contain at least ${minimum} characters and at most 72 UTF-8 bytes`,
      },
    });
}
