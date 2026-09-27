import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CreateAccountDto } from './dto/create-account.dto';
import { mailConfig, SmtpMailProvider } from './mail.provider';
import { actionHash } from './account-security.service';
import nodemailer from 'nodemailer';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));
describe('Account security boundaries', () => {
  it('normalizes phone formatting without claiming verification', async () => {
    const dto = plainToInstance(CreateAccountDto, {
      username: 'user',
      email: 'user@example.test',
      role: 'EMPLOYEE',
      phoneNumber: '+961 (70) 123-456',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.phoneNumber).toBe('+96170123456');
    for (const phoneNumber of [
      '12345',
      '+00012345678',
      '+961abcdef',
      '+1234567890123456',
    ]) {
      expect(
        (
          await validate(
            plainToInstance(CreateAccountDto, { ...dto, phoneNumber }),
          )
        ).length,
      ).toBeGreaterThan(0);
    }
  });
  it('fails closed for deployed mail settings and validates public URL', () => {
    for (const NODE_ENV of [undefined, 'production', 'staging'])
      expect(() => mailConfig({ NODE_ENV })).toThrow();
    expect(mailConfig({ NODE_ENV: 'test' })).toMatchObject({
      url: 'http://localhost:3000',
      host: '127.0.0.1',
      port: 1025,
      auth: undefined,
    });
    for (const APP_PUBLIC_URL of [
      'javascript:alert(1)',
      'https://user:password@example.test',
      'https://example.test/#token=x',
    ])
      expect(() => mailConfig({ NODE_ENV: 'test', APP_PUBLIC_URL })).toThrow();
  });
  it('sends only security templates through an SMTP transport with logging disabled', async () => {
    const sendMail = jest
      .fn<Promise<object>, [{ text: string }]>()
      .mockResolvedValue({});
    jest
      .mocked(nodemailer.createTransport)
      .mockReturnValue({ sendMail } as unknown as ReturnType<
        typeof nodemailer.createTransport
      >);
    const mail = new SmtpMailProvider();
    await mail.sendAccountActivation(
      'user@example.test',
      'http://localhost/activate#token=fixture',
    );
    await mail.sendPasswordReset(
      'user@example.test',
      'http://localhost/reset-password#token=fixture',
    );
    await mail.sendPasswordChanged('user@example.test');
    expect(sendMail).toHaveBeenCalledTimes(3);
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        logger: false,
        debug: false,
        disableFileAccess: true,
        disableUrlAccess: true,
      }),
    );
    const notice = sendMail.mock.calls[2][0];
    expect(notice.text).not.toContain('token');
    sendMail.mockRejectedValueOnce(new Error('SMTP down'));
    await expect(mail.sendPasswordChanged('user@example.test')).rejects.toThrow(
      'SMTP down',
    );
  });
  it('stores random-token digests and backfills activation without fabricated email verification', () => {
    expect(actionHash('fixture')).toMatch(/^[a-f0-9]{64}$/);
    const sql = readFileSync(
      join(
        __dirname,
        '../../prisma/migrations/20260927180000_account_activation/migration.sql',
      ),
      'utf8',
    );
    expect(sql).toContain(
      'SET "activatedAt" = "createdAt" WHERE "password" IS NOT NULL',
    );
    expect(sql).not.toMatch(/SET "emailVerifiedAt"/);
    expect(sql).toContain('ALTER COLUMN "password" DROP NOT NULL');
  });
});
