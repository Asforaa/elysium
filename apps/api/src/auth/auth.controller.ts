import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import type { AuthCredentials, AuthSessionResponse } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('session')
  getSession(@Req() request: Request): AuthSessionResponse {
    return this.authService.getSession(request.headers.cookie);
  }

  @Post('login')
  login(
    @Body() credentials: AuthCredentials | undefined,
    @Res({ passthrough: true }) response: Response,
  ): AuthSessionResponse {
    const session = this.authService.createSession(credentials);

    response.setHeader('Set-Cookie', session.cookie);

    return session.response;
  }

  @Post('signup')
  signup(
    @Body() credentials: AuthCredentials | undefined,
    @Res({ passthrough: true }) response: Response,
  ): AuthSessionResponse {
    const session = this.authService.createSession(credentials);

    response.setHeader('Set-Cookie', session.cookie);

    return session.response;
  }

  @Post('logout')
  logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): AuthSessionResponse {
    const session = this.authService.clearSession(request.headers.cookie);

    response.setHeader('Set-Cookie', session.cookie);

    return session.response;
  }
}
