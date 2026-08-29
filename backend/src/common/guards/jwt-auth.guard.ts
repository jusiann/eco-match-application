import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Erişim jetonu eksik.');
    }

    const token = authHeader.slice(7);

    try {
      const payload = this.jwtService.verify(token);
      if (payload.type) {
        // Refresh and email-verification tokens carry a `type` claim and must
        // never be accepted as access tokens.
        throw new Error('not an access token');
      }
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Geçersiz veya süresi dolmuş jeton.');
    }
  }
}
