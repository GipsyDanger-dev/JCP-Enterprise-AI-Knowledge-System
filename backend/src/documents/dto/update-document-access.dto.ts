import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

/**
 * Perubahan kategori dan penanda unit kerja sebuah dokumen.
 *
 * Bedanya `undefined` dan `null` disengaja dan dipakai service:
 *  - field tidak dikirim (`undefined`) berarti nilainya tidak diubah;
 *  - field dikirim bernilai `null` berarti dilepas — kategori dikosongkan,
 *    atau kunci unit kerja dibuka sehingga dokumen kembali terbuka.
 *
 * Tanpa pembedaan ini, "jangan sentuh kategorinya" dan "hapus kategorinya"
 * akan terlihat sama di server.
 */
export class UpdateDocumentAccessDto {
  @ApiPropertyOptional({
    description: 'Kategori/subjek dokumen. Kirim null untuk mengosongkan.',
    format: 'uuid',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4')
  categoryId?: string | null;

  @ApiPropertyOptional({
    description:
      'Batasi dokumen ini hanya untuk satu unit kerja. Kirim null untuk membuka ' +
      'kuncinya sehingga semua pegawai boleh membacanya.',
    format: 'uuid',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4')
  unitKerjaId?: string | null;
}
