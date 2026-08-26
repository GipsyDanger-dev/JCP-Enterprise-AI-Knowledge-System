import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Ip, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { AuthenticatedUser } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login as an active admin or user' })
  @ApiOkResponse({ description: 'JWT access token and safe user profile' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials or inactive user' })
  login(
    @Body() input: LoginDto,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string
  ) {
    return this.authService.login(input, ip, userAgent);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout and revoke the current session' })
  async logout(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.logout(user.sid, user.sub);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.USER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user from the access token' })
  @ApiOkResponse({ description: 'Authenticated token payload' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired token' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.sub);
  }
}
