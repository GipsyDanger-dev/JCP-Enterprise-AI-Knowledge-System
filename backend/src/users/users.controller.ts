import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired access token' })
@ApiForbiddenResponse({ description: 'Only ADMIN can manage users' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users without password hashes' })
  @ApiOkResponse({ description: 'All users ordered by creation time' })
  findAll() {
    return this.usersService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Create an active ADMIN or USER account' })
  @ApiCreatedResponse({ description: 'Safe profile of the newly created user' })
  @ApiBadRequestResponse({ description: 'Invalid email, name, password, or role' })
  @ApiConflictResponse({ description: 'The email address is already registered' })
  create(@Body() input: CreateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.create(input, actor);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update user profile (name, role, photo)' })
  @ApiOkResponse({ description: 'Updated user profile' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.update(id, input, actor);
  }

  @Put(':id/password')
  @ApiOperation({ summary: 'Change user password' })
  @ApiOkResponse({ description: 'Password changed successfully' })
  changePassword(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: ChangePasswordDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.changePassword(id, input, actor);
  }
}
