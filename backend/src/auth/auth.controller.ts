import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Ip, Post, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
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
import { RegisterCompanyDto } from './dto/register-company.dto';
import { CheckCompanyAvailabilityDto } from './dto/check-company-availability.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { EmailCodeDto } from './dto/email-code.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

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
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Send the verification code for a manual PERSONAL registration' })
  @ApiAcceptedResponse({ description: 'Verification code queued for delivery' })
  @ApiConflictResponse({ description: 'Email is already registered' })
  registerPersonal(@Body() input: RegisterPersonalDto) {
    return this.authService.registerPersonal(input);
  }

  @Post('register/personal/verify')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Verify the emailed code and create a PERSONAL account' })
  @ApiCreatedResponse({ description: 'JWT access token and verified PERSONAL user profile' })
  @ApiBadRequestResponse({ description: 'Invalid or expired verification code' })
  verifyPersonalRegistration(
    @Body() input: EmailCodeDto,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.verifyPersonalRegistration(input.email, input.code, ip, userAgent);
  }

  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Send a password reset code to a registered email address' })
  @ApiAcceptedResponse({ description: 'Password reset code queued for delivery' })
  @ApiNotFoundResponse({ description: 'No account is registered with this email' })
  forgotPassword(@Body() input: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(input.email);
  }

  @Post('password/verify-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a password reset code and return a one-time reset token' })
  @ApiBadRequestResponse({ description: 'Invalid or expired verification code' })
  verifyPasswordResetCode(@Body() input: EmailCodeDto) {
    return this.authService.verifyPasswordResetCode(input.email, input.code);
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a new password using a verified one-time reset token' })
  @ApiBadRequestResponse({ description: 'Invalid reset token or password confirmation' })
  resetPassword(@Body() input: ResetPasswordDto) {
    return this.authService.resetPassword(input.resetToken, input.password, input.confirmPassword);
  }

  @Post('register/company')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Send the verification code for a COMPANY registration' })
  @ApiAcceptedResponse({ description: 'Verification code queued for delivery; no workspace or trial created yet' })
  @ApiConflictResponse({ description: 'Username or email is already registered' })
  registerCompany(@Body() input: RegisterCompanyDto) {
    return this.authService.registerCompany(input);
  }

  @Post('register/company/verify')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Verify the admin email, then create the COMPANY workspace and start its trial' })
  @ApiCreatedResponse({ description: 'JWT access token or checkout details for the verified COMPANY administrator' })
  @ApiBadRequestResponse({ description: 'Invalid or expired verification code' })
  @ApiConflictResponse({ description: 'Username or email was registered while verification was pending' })
  verifyCompanyRegistration(
    @Body() input: EmailCodeDto,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.verifyCompanyRegistration(input.email, input.code, ip, userAgent);
  }

  @Post('register/company/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check company administrator username and email availability' })
  checkCompanyAvailability(@Body() input: CheckCompanyAvailabilityDto) {
    return this.authService.checkCompanyAvailability(input);
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

  @Put('me/profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update the current personal profile' })
  @ApiOkResponse({ description: 'Updated personal profile' })
  @ApiConflictResponse({ description: 'The username is already registered' })
  updateOwnProfile(@Body() input: UpdateOwnProfileDto, @CurrentUser() user: AuthenticatedUser) {
    return this.authService.updateOwnProfile(user, input);
  }
}
