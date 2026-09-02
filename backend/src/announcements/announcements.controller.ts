import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@ApiTags('announcements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.USER)
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser) { return this.announcements.list(actor); }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() input: CreateAnnouncementDto, @CurrentUser() actor: AuthenticatedUser) { return this.announcements.create(input, actor); }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() input: UpdateAnnouncementDto) { return this.announcements.update(id, input); }
}
