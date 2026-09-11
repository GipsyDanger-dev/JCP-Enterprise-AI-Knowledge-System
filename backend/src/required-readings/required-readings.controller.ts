import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequiredReadingsService } from './required-readings.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('required-readings')
export class RequiredReadingsController {
  constructor(private readonly service: RequiredReadingsService) {}

  // Tanpa @AdminOnly: jabatan yang dicentang "boleh tugaskan bacaan wajib" juga
  // berhak. Batasnya ditegakkan di service karena bergantung pada baris jabatan
  // pengguna, bukan sekadar flag admin yang dikenali RolesGuard.
  @Post('documents/:documentId/assign')
  assign(@Param('documentId', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: { userIds?: string[]; dueAt?: string }, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.assign(id, body.userIds ?? [], actor, body.dueAt);
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
  report(@CurrentUser() actor: AuthenticatedUser) { return this.service.report(actor); }
}
