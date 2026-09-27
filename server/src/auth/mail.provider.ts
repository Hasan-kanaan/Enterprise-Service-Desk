import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { deployedMode } from '../security/security.config';

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
  private async send(to: string, subject: string, text: string) {
    await this.transport.sendMail({
      from: this.config.from,
      to,
      subject,
      text,
    });
  }
  sendAccountActivation(email: string, link: string) {
    return this.send(
      email,
      'Activate your Enterprise Service Desk account',
      `Your Enterprise Service Desk account has been created. Choose your password using this single-use link (expires in 24 hours):\n${link}\nIf unexpected, ignore this email or contact company IT.`,
    );
  }
  sendPasswordReset(email: string, link: string) {
    return this.send(
      email,
      'Reset your Enterprise Service Desk password',
      `A password reset was requested. This single-use link expires in 30 minutes:\n${link}\nIgnore this email if you did not request it.`,
    );
  }
  sendPasswordChanged(email: string) {
    return this.send(
      email,
      'Enterprise Service Desk password changed',
      'Your Enterprise Service Desk password was changed. If this was not you, contact company IT/security.',
    );
  }
}

export const mailLogger = new Logger('AccountMail');
