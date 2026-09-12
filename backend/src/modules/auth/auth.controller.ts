import { Controller, Get, Post, Put, Delete, Body, UseGuards, Res, Req, UnauthorizedException } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, UpdateProfileDto } from './auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/v1/auth';
const REFRESH_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 gün — access/refresh token ömrüyle aynı, bkz. K-18

// docs/04'ün 3/saat ve 5/15dk limitleri IP bazlı -- tüm e2e paketi TEK bir IP'den (localhost)
// onlarca facility register/login çağrısı yapıyor, prod limitiyle kendi kendini kilitlerdi.
// K-18'deki secure-cookie kontrolüyle aynı "sadece production'da katı davran" deseni (K-28).
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const REGISTER_LIMIT = IS_PRODUCTION ? 3 : 1000;
const LOGIN_LIMIT = IS_PRODUCTION ? 5 : 1000;

// register/login kendi @Throttle(default:...) override'ına sahip; diğer route'lar
// (refresh/me/update-profile/logout/delete-account) hiçbirini tanımlamadığı için
// global 'chat-daily' (50/gün) bütçesini paylaşıyordu -- bkz. health.controller.ts
// başındaki not. Class-level SkipThrottle yalnızca bunu kapatır, register/login'in
// kendi method-level limitlerini etkilemez.
@SkipThrottle({ 'chat-daily': true })
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    private setRefreshCookie(reply: FastifyReply, refreshToken: string) {
        reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: REFRESH_COOKIE_PATH,
            maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
        });
    }

    private clearRefreshCookie(reply: FastifyReply) {
        reply.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
    }

    @Audit('create', 'facility')
    @Throttle({ default: { limit: REGISTER_LIMIT, ttl: 60 * 60 * 1000 } }) // docs/04: 3/saat, IP (spam) -- K-28
    @Post('register')
    async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) reply: FastifyReply) {
        const { refresh_token, ...body } = await this.authService.register(dto);
        this.setRefreshCookie(reply, refresh_token);
        return body;
    }

    @Throttle({ default: { limit: LOGIN_LIMIT, ttl: 15 * 60 * 1000 } }) // docs/04: 5/15dk, IP (brute force) -- K-28
    @Post('login')
    async login(@Body() dto: LoginDto, @Res({ passthrough: true }) reply: FastifyReply) {
        const { refresh_token, ...body } = await this.authService.login(dto);
        this.setRefreshCookie(reply, refresh_token);
        return body;
    }

    @Post('refresh')
    async refresh(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
        const refreshToken = request.cookies?.[REFRESH_COOKIE_NAME];
        if (!refreshToken) {
            throw new UnauthorizedException('Oturum bulunamadı, tekrar giriş yapın.');
        }

        const { refresh_token, ...body } = await this.authService.refresh(refreshToken);
        this.setRefreshCookie(reply, refresh_token);
        return body;
    }

    @UseGuards(JwtAuthGuard)
    @Get('me')
    getMe(@GetUser() user: { sub: string }) {
        return this.authService.getMe(user.sub);
    }

    @Audit('update', 'facility')
    @UseGuards(JwtAuthGuard)
    @Put('update-profile')
    updateProfile(@GetUser() user: { sub: string }, @Body() dto: UpdateProfileDto) {
        return this.authService.updateProfile(user.sub, dto);
    }

    @UseGuards(JwtAuthGuard)
    @Post('logout')
    async logout(@GetUser() user: { sub: string }, @Res({ passthrough: true }) reply: FastifyReply) {
        const result = await this.authService.logout(user.sub);
        this.clearRefreshCookie(reply);
        return result;
    }

    @Audit('delete', 'facility')
    @UseGuards(JwtAuthGuard)
    @Delete('delete-account')
    async deleteAccount(@GetUser() user: { sub: string }, @Res({ passthrough: true }) reply: FastifyReply) {
        const result = await this.authService.deleteAccount(user.sub);
        this.clearRefreshCookie(reply);
        return result;
    }
}
