import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Ip, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AuthenticatedUser } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { RegisterPersonalDto } from './dto/register-personal.dto';

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

  @Post('register/personal')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a PERSONAL account with email and password' })
  @ApiCreatedResponse({ description: 'JWT access token and PERSONAL user profile' })
  @ApiConflictResponse({ description: 'Email is already registered' })
  registerPersonal(
    @Body() input: RegisterPersonalDto,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.registerPersonal(input, ip, userAgent);
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in or register a PERSONAL account with Google' })
  @ApiOkResponse({ description: 'Application JWT and PERSONAL user profile' })
  @ApiUnauthorizedResponse({ description: 'Invalid Google credential' })
  @ApiConflictResponse({ description: 'Email already belongs to another account' })
  @ApiServiceUnavailableResponse({ description: 'Google authentication is not configured' })
  googleLogin(
    @Body() input: GoogleLoginDto,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.googleLogin(input, ip, userAgent);
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user from the access token' })
  @ApiOkResponse({ description: 'Authenticated token payload' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired token' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.sub);
  }
}
