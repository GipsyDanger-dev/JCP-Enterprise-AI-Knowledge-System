import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
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
  @ApiOperation({ summary: 'List active users without password hashes' })
  @ApiOkResponse({ description: 'Active users ordered by creation time' })
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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate a user while preserving historical records' })
  @ApiNoContentResponse({ description: 'User deactivated' })
  @ApiNotFoundResponse({ description: 'Active user not found' })
  @ApiConflictResponse({ description: 'The last active admin cannot be deactivated' })
  deactivate(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.deactivate(id, actor);
  }
}
