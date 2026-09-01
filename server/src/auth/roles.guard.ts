import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: { role?: string } }>();
    const userRole = request.user?.role;

    if (!userRole) {
      throw new ForbiddenException('User role is missing');
    }

    const hasAccess = requiredRoles.includes(userRole);

    if (!hasAccess) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }

    return true;
  }
}
