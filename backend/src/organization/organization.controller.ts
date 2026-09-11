import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminOnly } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  CreateJabatanDto,
  CreateUnitKerjaDto,
  UpdateJabatanDto,
  UpdateRoleLabelDto,
  UpdateUnitKerjaDto,
} from './dto/organization.dto';
import { OrganizationService } from './organization.service';

/**
 * Daftar acuan organisasi, khusus super admin.
 *
 * Terpisah dari /users karena isinya bukan orang melainkan kerangka tempat
 * orang ditaruh — dan karena form pembuatan akun membacanya lewat
 * /users/reference-data, yang terbuka untuk seluruh admin.
 */
@ApiTags('organization')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired access token' })
@ApiForbiddenResponse({ description: 'Only organization admins can manage reference data' })
@UseGuards(JwtAuthGuard, RolesGuard)
@AdminOnly()
@Controller('organization')
export class OrganizationController {
  constructor(private readonly organization: OrganizationService) {}

  @Get()
  @ApiOperation({ summary: 'Unit kerja, jabatan, dan nama role beserta jumlah pemakainya' })
  @ApiOkResponse({ description: 'Seluruh daftar acuan workspace ini' })
  overview(@CurrentUser() actor: AuthenticatedUser) {
    return this.organization.overview(actor);
  }

  @Post('unit-kerja')
  @ApiOperation({ summary: 'Tambah unit kerja / divisi' })
  @ApiCreatedResponse({ description: 'Unit kerja yang baru dibuat' })
  @ApiConflictResponse({ description: 'Kode unit kerja sudah dipakai' })
  createUnitKerja(@Body() input: CreateUnitKerjaDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.organization.createUnitKerja(input, actor);
  }

  @Put('unit-kerja/:id')
  @ApiOperation({ summary: 'Ubah nama atau status aktif unit kerja' })
  @ApiOkResponse({ description: 'Unit kerja setelah diubah' })
  updateUnitKerja(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: UpdateUnitKerjaDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.organization.updateUnitKerja(id, input, actor);
  }

  @Delete('unit-kerja/:id')
  @ApiOperation({ summary: 'Hapus unit kerja yang belum dipakai siapa pun' })
  @ApiConflictResponse({ description: 'Masih dipakai pengguna atau dokumen — nonaktifkan saja' })
  removeUnitKerja(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.organization.removeUnitKerja(id, actor);
  }

  @Post('jabatan')
  @ApiOperation({ summary: 'Tambah jabatan beserta wewenangnya' })
  @ApiCreatedResponse({ description: 'Jabatan yang baru dibuat' })
  @ApiConflictResponse({ description: 'Nama jabatan sudah ada' })
  createJabatan(@Body() input: CreateJabatanDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.organization.createJabatan(input, actor);
  }

  @Put('jabatan/:id')
  @ApiOperation({ summary: 'Ubah nama, wewenang, atau status aktif jabatan' })
  @ApiOkResponse({ description: 'Jabatan setelah diubah' })
  updateJabatan(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: UpdateJabatanDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.organization.updateJabatan(id, input, actor);
  }

  @Delete('jabatan/:id')
  @ApiOperation({ summary: 'Hapus jabatan yang belum dipegang siapa pun' })
  @ApiConflictResponse({ description: 'Masih dipegang pengguna — nonaktifkan saja' })
  removeJabatan(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.organization.removeJabatan(id, actor);
  }

  /**
   * Hanya nama tampilannya yang bisa diubah, bukan wewenangnya, dan role baru
   * tidak bisa ditambah — lihat OrganizationService untuk alasannya.
   */
  @Put('role-labels/:role')
  @ApiOperation({ summary: 'Ganti nama tampilan salah satu dari ketiga role' })
  @ApiOkResponse({ description: 'Nama role setelah diubah' })
  updateRoleLabel(
    @Param('role') role: UserRole,
    @Body() input: UpdateRoleLabelDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.organization.updateRoleLabel(role, input, actor);
  }
}
