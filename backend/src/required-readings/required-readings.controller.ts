import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequiredReadingsService } from './required-readings.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('required-readings')
export class RequiredReadingsController {
  constructor(private readonly service: RequiredReadingsService) {}

  @Post('documents/:documentId/assign')
  @Roles(UserRole.ADMIN)
  assign(@Param('documentId', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: { userIds?: string[]; dueAt?: string }) {
    return this.service.assign(id, body.userIds ?? [], body.dueAt);
  }

  @Get('mine')
  @Roles(UserRole.USER)
  mine(@CurrentUser() user: AuthenticatedUser) { return this.service.mine(user.sub); }

  @Post(':id/progress')
  @Roles(UserRole.USER)
  progress(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: { progress?: number }, @CurrentUser() user: AuthenticatedUser) {
    return this.service.updateProgress(id, user.sub, body.progress);
  }

  @Post(':id/complete')
  @Roles(UserRole.USER)
  complete(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.complete(id, user.sub);
  }

  @Get('report')
  @Roles(UserRole.ADMIN)
  report() { return this.service.report(); }
}
