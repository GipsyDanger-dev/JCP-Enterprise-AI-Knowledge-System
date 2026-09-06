import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { AdminOnly } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequiredReadingsService } from './required-readings.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('required-readings')
export class RequiredReadingsController {
  constructor(private readonly service: RequiredReadingsService) {}

  @Post('documents/:documentId/assign')
  @AdminOnly()
  assign(@Param('documentId', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: { userIds?: string[]; dueAt?: string }) {
    return this.service.assign(id, body.userIds ?? [], body.dueAt);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser) { return this.service.mine(user.sub); }

  @Post(':id/progress')
  progress(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: { progress?: number }, @CurrentUser() user: AuthenticatedUser) {
    return this.service.updateProgress(id, user.sub, body.progress);
  }

  @Post(':id/complete')
  complete(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.complete(id, user.sub);
  }

  @Get('report')
  @AdminOnly()
  report() { return this.service.report(); }
}
