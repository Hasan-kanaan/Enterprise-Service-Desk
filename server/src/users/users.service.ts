import { ConflictException, Injectable } from '@nestjs/common';
import { UserRole } from './user-role.enum';

export type UserRecord = {
  id: number;
  email: string;
  password: string;
  role: UserRole;
};

@Injectable()
export class UsersService {
  private readonly users: UserRecord[] = [
    {
      id: 1,
      email: 'admin@company.com',
      password: '$2a$10$wCkA1h4nYF2XEqFv2jS1JeP9v6mQ/4bS.TWb6D7TZJgn7yPXoRtZa',
      role: UserRole.ADMIN,
    },
  ];

  private nextId = 2;

  findAll() {
    return this.users.map(({ password, ...user }) => user);
  }

  findByEmail(email: string) {
    const normalized = email.trim().toLowerCase();
    return this.users.find((user) => user.email.toLowerCase() === normalized) ?? null;
  }

  create(data: { email: string; password: string; role: UserRole }) {
    const normalizedEmail = data.email.trim().toLowerCase();

    if (this.findByEmail(normalizedEmail)) {
      throw new ConflictException('User with this email already exists');
    }

    const user: UserRecord = {
      id: this.nextId++,
      email: normalizedEmail,
      password: data.password,
      role: data.role,
    };

    this.users.push(user);

    const { password, ...safeUser } = user;
    return safeUser;
  }
}
