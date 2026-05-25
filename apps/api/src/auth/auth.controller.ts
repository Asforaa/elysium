import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import type { AuthCredentials, AuthSessionResponse } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('session')
  getSession(@Req() request: Request): Promise<AuthSessionResponse> {
    return this.authService.getSession(request.headers.cookie);
  }

  @Post('login')
  async login(
    @Body() credentials: AuthCredentials | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    const session = await this.authService.login(credentials);

    response.setHeader('Set-Cookie', session.cookie);

    return session.response;
  }

  @Post('signup')
  async signup(
    @Body() credentials: AuthCredentials | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    const session = await this.authService.signup(credentials);

    response.setHeader('Set-Cookie', session.cookie);

    return session.response;
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    const session = await this.authService.clearSession(request.headers.cookie);

    response.setHeader('Set-Cookie', session.cookie);

    return session.response;
  }
}
