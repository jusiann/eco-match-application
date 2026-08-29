import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

// Runs after JwtAuthGuard on the same route -- it reads request.user.role,
// which JwtAuthGuard is responsible for populating. Use together:
// @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const role: UserRole | undefined = request.user?.role;

    if (!role || !requiredRoles.includes(role)) {
      throw new ForbiddenException({
        error: 'INSUFFICIENT_ROLE',
        message: 'Bu işlem için yetkiniz yok.',
      });
    }

    return true;
  }
}
