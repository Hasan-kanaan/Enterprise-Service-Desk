import supertest from 'supertest';
import type { Ticket, Subtask } from '../generated/prisma/client';
import type { TicketVisibilityService } from '../src/tickets/ticket-visibility.service';
import type { TicketWorkspaceController } from '../src/tickets/ticket-workspace.controller';
import type { TicketCommunicationService } from '../src/tickets/ticket-communication.service';
import type { AttachmentsController } from '../src/tickets/attachments.controller';
import type { WorkHistoryService } from '../src/tickets/work-history.service';
import type { NotificationsController } from '../src/notifications/notifications.controller';
import type { AuthService } from '../src/auth/auth.service';

// Supertest's body is any. Keep response contracts at the test boundary while
// retaining the actual HTTP request and all existing runtime assertions.
type Json<T> = T extends Date
  ? string
  : T extends object
    ? { [K in keyof T]: Json<T[K]> }
    : T;
type Result<T extends (...args: never[]) => unknown> = Json<
  Awaited<ReturnType<T>>
>;
export type HistoryPage = Result<WorkHistoryService['list']>;
type Communication = Result<TicketCommunicationService['read']>;
export type Message = Omit<
  Communication['records'][number],
  'canEdit' | 'canDelete'
>;
export type Attachment = Message['attachments'][number];
type GetBody<P extends string> = P extends
  | `/ticket-workspace/tickets/${string}/people${string}`
  | `/ticket-workspace/subtasks/${string}/people${string}`
  ? { id: number; username: string }[]
  : P extends `/organization/teams/${string}/members${string}`
    ? Result<
        import('../src/organization/organization.service').OrganizationService['listMembers']
      >
    : P extends `/tickets/${string}/subtasks${string}`
      ? Result<TicketVisibilityService['listVisibleSubtasks']>
      : P extends '/ticket-options'
        ? Result<
            import('../src/tickets/ticket-options.controller').TicketOptionsController['list']
          >
        : P extends '/users' | `/users?${string}`
          ? Result<import('../src/users/users.service').UsersService['findAll']>
          : P extends '/organization/teams'
            ? Result<
                import('../src/organization/organization.service').OrganizationService['listTeams']
              >
            : P extends `/my-work-history${string}`
              ? HistoryPage
              : P extends '/notifications/unread-count'
                ? { count: number }
                : P extends `/notifications${string}`
                  ? Result<NotificationsController['list']>
                  : P extends `/ticket-workspace/tickets/${string}`
                    ? Result<TicketWorkspaceController['ticket']>
                    : P extends `/ticket-workspace/subtasks/${string}`
                      ? Result<TicketWorkspaceController['subtask']>
                      : P extends '/ticket-workspace'
                        ? Result<TicketWorkspaceController['context']>
                        : P extends `/tickets/${string}/history`
                          ? Result<TicketVisibilityService['history']>
                          : P extends `/tickets/${string}/attachments`
                            ? Result<AttachmentsController['list']>
                            : P extends
                                  | `/tickets/${string}/messages`
                                  | `/tickets/${string}/internal-notes`
                              ? Communication
                              : P extends `/tickets/subtasks/${string}`
                                ? Json<Subtask>
                                : P extends `/tickets/subtasks${string}`
                                  ? Result<
                                      TicketVisibilityService['listVisibleSubtasks']
                                    >
                                  : P extends '/tickets' | `/tickets?${string}`
                                    ? Result<
                                        TicketVisibilityService['listVisible']
                                      >
                                    : P extends `/tickets/${string}`
                                      ? Result<
                                          TicketVisibilityService['findVisibleById']
                                        >
                                      : unknown;
type WriteBody<P extends string> = P extends '/auth/accounts'
  ? Result<AuthService['createAccount']>
  : P extends '/auth/login' | '/auth/refresh'
    ? Omit<Result<AuthService['login']>, 'refreshToken'>
    : P extends
          | `/tickets/${string}/messages${string}`
          | `/tickets/${string}/internal-notes${string}`
      ? Message
      : P extends `/tickets/${string}/subtasks` | `/tickets/subtasks/${string}`
        ? Json<Subtask>
        : P extends `/tickets${string}`
          ? Json<Ticket>
          : unknown;
type Response<T> = Omit<supertest.Response, 'body'> & { body: T };
type Fluent<T> = {
  [K in keyof supertest.Test]: supertest.Test[K] extends (
    ...args: infer A
  ) => supertest.Test
    ? (...args: A) => HttpTest<T>
    : supertest.Test[K];
};
export type HttpTest<T> = Omit<Fluent<T>, 'then' | 'expect'> & {
  then: Promise<Response<T>>['then'];
  expect(status: number, body?: unknown): HttpTest<T>;
  expect(check: (response: Response<T>) => void): HttpTest<T>;
  expect(field: string, value: string | RegExp): HttpTest<T>;
};
type Agent = {
  get<P extends string>(path: P): HttpTest<GetBody<P>>;
  post<P extends string>(path: P): HttpTest<WriteBody<P>>;
  patch<P extends string>(path: P): HttpTest<WriteBody<P>>;
  delete<P extends string>(path: P): HttpTest<WriteBody<P>>;
  put<P extends string>(path: P): HttpTest<unknown>;
};
export default function request(app: Parameters<typeof supertest>[0]): Agent {
  return supertest(app);
}
