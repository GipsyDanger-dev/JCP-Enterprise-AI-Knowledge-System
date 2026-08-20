import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
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
  login(@Body() input: LoginDto) {
    return this.authService.login(input);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.USER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user from the access token' })
  @ApiOkResponse({ description: 'Authenticated token payload with display name' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired token' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
