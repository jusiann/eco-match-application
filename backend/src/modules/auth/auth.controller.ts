import { Controller, Get, Post, Put, Delete, Body, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, UpdateProfileDto, RefreshDto, VerifyEmailDto } from './auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Audit('create', 'facility')
    @Post('register')
    register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    @Post('login')
    login(@Body() dto: LoginDto) {
        return this.authService.login(dto);
    }

    @Post('refresh')
    refresh(@Body() dto: RefreshDto) {
        return this.authService.refresh(dto.refreshToken);
    }

    @Post('verify-email')
    verifyEmail(@Body() dto: VerifyEmailDto) {
        return this.authService.verifyEmail(dto.token);
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
    logout(@GetUser() user: { sub: string }) {
        return this.authService.logout(user.sub);
    }

    @Audit('delete', 'facility')
    @UseGuards(JwtAuthGuard)
    @Delete('delete-account')
    deleteAccount(@GetUser() user: { sub: string }) {
        return this.authService.deleteAccount(user.sub);
    }
}
