import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { deployedMode } from '../security/security.config';
import {
  accountActivationEmail,
  passwordResetEmail,
  passwordChangedEmail,
} from './security-email.templates';

export abstract class MailProvider {
  abstract sendAccountActivation(email: string, link: string): Promise<void>;
  abstract sendPasswordReset(email: string, link: string): Promise<void>;
  abstract sendPasswordChanged(email: string): Promise<void>;
}

export function mailConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = deployedMode(env);
  if (
    production &&
    (!env.SMTP_HOST ||
      !env.SMTP_PORT ||
      !env.MAIL_FROM ||
      !env.APP_PUBLIC_URL ||
      env.MAIL_PROVIDER !== 'smtp')
  )
    throw new Error(
      'Explicit SMTP and public application URL configuration required',
    );
  if (env.MAIL_PROVIDER && env.MAIL_PROVIDER !== 'smtp')
    throw new Error('Unsupported mail provider');
  const url = new URL(env.APP_PUBLIC_URL || 'http://localhost:3000');
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (production && url.protocol !== 'https:')
  )
    throw new Error('Invalid APP_PUBLIC_URL');
  const port = Number(env.SMTP_PORT || 1025);
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    (env.SMTP_SECURE && !['true', 'false'].includes(env.SMTP_SECURE))
  )
    throw new Error('Invalid SMTP configuration');
  if (!!env.SMTP_USER !== !!env.SMTP_PASSWORD)
    throw new Error('SMTP credentials must be configured together');
  return {
    url: url.toString().replace(/\/$/, ''),
    from: env.MAIL_FROM || 'Enterprise Service Desk <accounts@localhost>',
    host: env.SMTP_HOST || '127.0.0.1',
    port,
    secure: env.SMTP_SECURE === 'true',
    production,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD! }
      : undefined,
  };
}

@Injectable()
export class SmtpMailProvider extends MailProvider {
  private readonly config = mailConfig();
  private readonly transport = nodemailer.createTransport({
    host: this.config.host,
    port: this.config.port,
    secure: this.config.secure,
    auth: this.config.auth,
    requireTLS: this.config.production,
    logger: false,
    debug: false,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  private async send(
    to: string,
    subject: string,
    content: { text: string; html: string },
  ) {
    await this.transport.sendMail({
      from: this.config.from,
      to,
      subject,
      ...content,
    });
  }
  sendAccountActivation(email: string, link: string) {
    return this.send(
      email,
      'Activate your Kino Service Desk account',
      accountActivationEmail(link),
    );
  }
  sendPasswordReset(email: string, link: string) {
    return this.send(
      email,
      'Reset your Kino Service Desk password',
      passwordResetEmail(link),
    );
  }
  sendPasswordChanged(email: string) {
    return this.send(
      email,
      'Kino Service Desk password changed',
      passwordChangedEmail(),
    );
  }
}

export const mailLogger = new Logger('AccountMail');
