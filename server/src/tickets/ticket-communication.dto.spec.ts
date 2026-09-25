import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateCommunicationDto,
  EditCommunicationDto,
} from './dto/ticket-communication.dto';

describe('Communication input', () => {
  it.each(['', '   ', 'x'.repeat(4001), null])(
    'rejects empty, overlong, or non-text input',
    async (content) => {
      expect(
        (
          await validate(
            plainToInstance(EditCommunicationDto, {
              content,
              expectedCycleId: 1,
            }),
          )
        ).length,
      ).toBeGreaterThan(0);
    },
  );
  it('trims text, requires a real cycle and a UUID creation key', async () => {
    const dto = plainToInstance(CreateCommunicationDto, {
      content: ' reply ',
      expectedCycleId: 1,
      clientRequestId: '27f9948d-415c-4ad0-bc1b-1cf89b607111',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.content).toBe('reply');
    dto.expectedCycleId = 0;
    dto.clientRequestId = 'invalid';
    expect(await validate(dto)).toHaveLength(2);
  });
});
