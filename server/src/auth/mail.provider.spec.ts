import nodemailer from 'nodemailer';
import { SmtpMailProvider } from './mail.provider';
import {
  accountActivationEmail,
  passwordResetEmail,
} from './security-email.templates';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

type Message = {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
};

describe('Account security email rendering', () => {
  const originalEnv = process.env;
  const sendMail = jest.fn<Promise<object>, [Message]>();
  let provider: SmtpMailProvider;

  beforeEach(() => {
    process.env = {
      NODE_ENV: 'production',
      MAIL_PROVIDER: 'smtp',
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
      SMTP_USER: 'fixture-smtp-user',
      SMTP_PASSWORD: 'fixture-smtp-password',
      MAIL_FROM: 'Kino Service Desk <security@example.test>',
      APP_PUBLIC_URL: 'https://desk.example.test',
      INITIAL_SETUP_SECRET: 'fixture-installation-secret-never-in-mail',
    };
    jest.clearAllMocks();
    sendMail.mockResolvedValue({});
    jest
      .mocked(nodemailer.createTransport)
      .mockReturnValue({ sendMail } as unknown as ReturnType<
        typeof nodemailer.createTransport
      >);
    provider = new SmtpMailProvider();
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it('preserves bounded, TLS-required, non-debug SMTP options', () => {
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.test',
      port: 587,
      secure: false,
      auth: { user: 'fixture-smtp-user', pass: 'fixture-smtp-password' },
      requireTLS: true,
      logger: false,
      debug: false,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it.each([
    ['activation', 'activate', 'Activate account', '24 hours'],
    ['reset', 'reset-password', 'Reset password', '30 minutes'],
  ] as const)(
    'sends branded %s HTML, intended CTA and text fallback',
    async (kind, path, cta, expiry) => {
      const link = `https://desk.example.test/${path}#token=fixture-action-token`;
      if (kind === 'activation')
        await provider.sendAccountActivation('person@example.test', link);
      else await provider.sendPasswordReset('person@example.test', link);
      const message = sendMail.mock.calls[0][0];
      expect(message).toMatchObject({
        to: 'person@example.test',
        from: process.env.MAIL_FROM,
      });
      for (const body of [message.text, message.html]) {
        for (const expected of [
          'Kino Service Desk',
          'single-use',
          expiry,
          link,
          cta,
        ])
          expect(body).toContain(expected);
      }
      expect(message.html).toContain(`href="${link}"`);
      expect(message.html).toContain(`>${cta}</a>`);
      expect(message.html).toContain(`>${link}</a>`);
      expect(message.html).toContain('copy and paste');
      if (kind === 'activation') {
        expect(message.text).toContain(
          'Verify your address and choose your own password',
        );
        expect(message.html).toContain('contact company IT/security');
      } else
        expect(message.text).toContain(
          'Your password has not been changed by this request.',
        );
    },
  );

  it('sends a changed-password notice in both formats without a link or token', async () => {
    await provider.sendPasswordChanged('person@example.test');
    const message = sendMail.mock.calls[0][0];
    for (const body of [message.text, message.html]) {
      expect(body).toContain('Your Kino Service Desk password was changed.');
      expect(body).toContain('no further action is required');
      expect(body).toContain('contact company IT/security immediately');
      expect(body).not.toMatch(
        /https?:|href=|token|device\s|location|IP address/i,
      );
    }
  });

  it('contains no secrets, ticket data or external rendering dependencies', async () => {
    await provider.sendAccountActivation(
      'person@example.test',
      'https://desk.example.test/activate#token=fixture',
    );
    await provider.sendPasswordReset(
      'person@example.test',
      'https://desk.example.test/reset-password#token=fixture',
    );
    await provider.sendPasswordChanged('person@example.test');
    for (const [message] of sendMail.mock.calls) {
      const serialized = JSON.stringify(message);
      for (const secret of [
        process.env.INITIAL_SETUP_SECRET!,
        process.env.SMTP_PASSWORD!,
        'fixture-user-password',
      ])
        expect(serialized).not.toContain(secret);
      expect(serialized).not.toMatch(
        /setupSecret|ticket|subtask|assignment|SUPER_ADMIN|sessionVersion|refreshToken/,
      );
      expect(message.html).not.toMatch(
        /<script|<img|<link|<style|<iframe|<form|@import|url\(|\son\w+=/i,
      );
      expect(message.html).toContain('name="viewport"');
      expect(message.html).toContain('role="presentation"');
      expect(message.html).toContain('You received');
    }
  });

  it.each([accountActivationEmail, passwordResetEmail])(
    'escapes URLs in HTML text and attributes',
    (render) => {
      const link = `https://desk.example.test/activate#token=fixture&value="'><img src=x>`;
      const { html, text } = render(link);
      const escaped =
        'https://desk.example.test/activate#token=fixture&amp;value=&quot;&#39;&gt;&lt;img src=x&gt;';
      expect(html).toContain(`href="${escaped}"`);
      expect(html).toContain(`>${escaped}</a>`);
      expect(html).not.toContain('<img');
      expect(text).toContain(link);
    },
  );

  it.each([
    'javascript:alert(1)',
    'file:///tmp/secret',
    'https://user:password@example.test/activate',
    'not-a-url',
  ])('rejects unsafe URLs without echoing them', (link) => {
    expect(() => accountActivationEmail(link)).toThrow(
      'Invalid account email URL',
    );
    expect(() => passwordResetEmail(link)).toThrow('Invalid account email URL');
    expect(sendMail).not.toHaveBeenCalled();
  });
});
