import { Body, Controller, Delete, Get, Header, Headers, Param, ParseUUIDPipe, Patch, Post, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

/**
 * Bagian dari objek Response yang benar-benar dipakai di berkas ini.
 *
 * Diketik seperlunya, bukan diimpor dari 'express': @types/express bukan
 * dependensi proyek ini, dan menambahkannya hanya demi dua pemanggilan method
 * tidak sepadan. Bentuk ini tetap dipenuhi objek Response yang asli.
 */
interface CacheableResponse {
  setHeader(name: string, value: string): unknown;
  status(code: number): unknown;
}

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

  /**
   * Gambar pengumuman sebagai biner.
   *
   * Terpisah dari daftarnya supaya bisa di-cache browser. `must-revalidate`
   * dengan `max-age=0` dipilih daripada `immutable`: alamatnya tetap sama
   * setelah gambarnya diganti, jadi jawabannya harus selalu diperiksa ulang —
   * tetapi pemeriksaan itu berhenti di 304 tanpa badan, yang justru merupakan
   * seluruh penghematannya.
   */
  @Get(':id/image')
  @ApiOperation({ summary: 'Gambar pengumuman, sebagai berkas tersendiri agar bisa di-cache' })
  @ApiOkResponse({ description: 'Biner gambarnya' })
  @ApiNotFoundResponse({ description: 'Pengumumannya tidak ada, di luar jangkauan aktor, atau tanpa gambar' })
  @Header('Cache-Control', 'private, max-age=0, must-revalidate')
  async image(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) response: CacheableResponse,
    @Headers('if-none-match') ifNoneMatch?: string,
  ): Promise<StreamableFile | undefined> {
    const result = await this.announcements.image(id, actor, ifNoneMatch);
    response.setHeader('ETag', result.etag);
    if (result.notModified) {
      response.status(304);
      return undefined;
    }
    return new StreamableFile(result.content, {
      type: result.mimeType,
      length: result.content.byteLength,
    });
  }

  /** Laporan siapa sudah dan belum membaca satu pengumuman. */
  @Get(':id/readers')
  @ApiOperation({ summary: 'Daftar pegawai yang sudah dan belum membaca pengumuman' })
  @ApiOkResponse({ description: 'Pembaca beserta waktu bacanya, dan yang belum membaca' })
  @ApiForbiddenResponse({ description: 'Jabatannya tidak diberi wewenang atas pengumuman' })
  readers(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.announcements.readers(id, actor);
  }

  // Tanpa @AdminOnly: jabatan yang dicentang "boleh kelola pengumuman" juga
  // berhak. Batasnya ditegakkan di service karena bergantung pada baris jabatan
  // pengguna, bukan sekadar flag admin yang dikenali RolesGuard.
  @Post()
  @ApiForbiddenResponse({ description: 'Jabatannya tidak diberi wewenang atas pengumuman' })
  create(@Body() input: CreateAnnouncementDto, @CurrentUser() actor: AuthenticatedUser) { return this.announcements.create(input, actor); }

  @Patch(':id')
  @ApiForbiddenResponse({ description: 'Bukan penerbitnya sendiri maupun admin' })
  update(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() input: UpdateAnnouncementDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.announcements.update(id, input, actor);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Hapus pengumuman beserta bukti bacanya — berbeda dari mengarsipkan' })
  @ApiForbiddenResponse({ description: 'Bukan penerbitnya sendiri maupun admin' })
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.announcements.remove(id, actor);
  }
}
