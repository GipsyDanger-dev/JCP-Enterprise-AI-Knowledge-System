import { ApiProperty } from '@nestjs/swagger';
import { LegalStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

/**
 * Perubahan status keberlakuan sebuah dokumen.
 *
 * Berdiri sendiri, tidak digabung ke UpdateDocumentAccessDto, karena wewenangnya
 * berbeda: kategori dan penanda unit milik pengelola dokumen, sedangkan status
 * keberlakuan bisa dipegang jabatan lain lewat centang canManageLegalStatus.
 * Satu DTO untuk dua wewenang berarti satu permintaan bisa lolos separuh, dan
 * tidak ada cara jujur menolaknya sebagian.
 *
 * Wajib, bukan opsional: permintaan yang tidak menyebut status baru tidak punya
 * arti sama sekali di endpoint ini.
 */
export class UpdateDocumentLegalStatusDto {
  @ApiProperty({
    description:
      'Status keberlakuan yang baru. RANCANGAN menyembunyikan dokumen dari pegawai ' +
      'dan dari AI; status lain tidak mengubah siapa yang boleh membacanya.',
    enum: LegalStatus,
  })
  @IsEnum(LegalStatus)
  legalStatus!: LegalStatus;
}
