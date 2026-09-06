import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@ApiTags('announcements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser) { return this.announcements.list(actor); }

  /** Jumlah pengumuman yang belum dibaca — dipakai badge di sidebar. */
  @Get('unread')
  unreadCount(@CurrentUser() actor: AuthenticatedUser) { return this.announcements.unreadCount(actor.sub); }

  /** Wewenang penerbitan milik pengguna ini; dipakai UI untuk menampilkan tombolnya. */
  @Get('permissions')
  @ApiOperation({ summary: 'Apakah pengguna ini boleh menerbitkan pengumuman' })
  permissions(@CurrentUser() actor: AuthenticatedUser) { return this.announcements.permissions(actor); }

  /** Dipanggil saat pengguna membuka halaman pengumuman. */
  @Post('read')
  markRead(@CurrentUser() actor: AuthenticatedUser) { return this.announcements.markRead(actor.sub); }

  /** Laporan siapa sudah dan belum membaca satu pengumuman. */
  @Get(':id/readers')
  @ApiOperation({ summary: 'Daftar pegawai yang sudah dan belum membaca pengumuman' })
  @ApiOkResponse({ description: 'Pembaca beserta waktu bacanya, dan yang belum membaca' })
  @ApiForbiddenResponse({ description: 'Bukan admin maupun jabatan yang berhak menerbitkan pengumuman' })
  readers(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.announcements.readers(id, actor);
  }

  // Tanpa @AdminOnly: jabatan pimpinan (lihat JABATAN_PENERBIT_PENGUMUMAN) juga
  // boleh menerbitkan. Batasnya ditegakkan di service karena bergantung pada
  // jabatan pengguna, bukan sekadar flag admin yang dikenali RolesGuard.
  @Post()
  @ApiForbiddenResponse({ description: 'Bukan admin maupun jabatan yang berhak menerbitkan pengumuman' })
  create(@Body() input: CreateAnnouncementDto, @CurrentUser() actor: AuthenticatedUser) { return this.announcements.create(input, actor); }

  @Patch(':id')
  @ApiForbiddenResponse({ description: 'Bukan penerbitnya sendiri maupun admin' })
  update(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() input: UpdateAnnouncementDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.announcements.update(id, input, actor);
  }
}
