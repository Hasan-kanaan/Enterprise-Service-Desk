import { MailProvider } from '../src/auth/mail.provider';
export class FakeMailProvider extends MailProvider {
  messages: { type: string; email: string; link?: string }[] = [];
  fail = false;
  private send(type: string, email: string, link?: string) {
    if (this.fail)
      return Promise.reject(new Error('Simulated delivery failure'));
    this.messages.push({ type, email, link });
    return Promise.resolve();
  }
  sendAccountActivation(email: string, link: string) {
    return this.send('activation', email, link);
  }
  sendPasswordReset(email: string, link: string) {
    return this.send('reset', email, link);
  }
  sendPasswordChanged(email: string) {
    return this.send('changed', email);
  }
  token(email: string, type: string) {
    const message = this.messages
      .filter((m) => m.email === email && m.type === type)
      .at(-1);
    if (!message?.link) throw new Error('Expected account email');
    return new URLSearchParams(new URL(message.link).hash.slice(1)).get(
      'token',
    )!;
  }
}
