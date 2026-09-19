import { ApiPropertyOptional } from '@nestjs/swagger';
import { LegalStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateDocumentDto {
  @ApiPropertyOptional({ description: 'Defaults to the uploaded filename' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Nama koleksi warisan. Dipertahankan agar klien lama tidak pecah; pakai categoryId.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  collection?: string;

  @ApiPropertyOptional({
    description: 'Kategori/subjek dokumen. Menentukan unit kerja mana yang boleh membacanya.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({
    description:
      'Batasi dokumen ini hanya untuk satu unit kerja. Hanya boleh mempersempit akses ' +
      'yang sudah ditentukan kategori, tidak pernah memperluasnya.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4')
  unitKerjaId?: string;

  @ApiPropertyOptional({
    description:
      'Status keberlakuan dokumen. Tanpa nilai, dokumen tersimpan BERLAKU. ' +
      'RANCANGAN disembunyikan dari pegawai dan tidak pernah dikutip AI.',
    enum: LegalStatus,
    default: LegalStatus.BERLAKU,
  })
  @IsOptional()
  @IsEnum(LegalStatus)
  legalStatus?: LegalStatus;
}
