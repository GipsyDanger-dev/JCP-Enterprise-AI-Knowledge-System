import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

const pangkas = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateUnitKerjaDto {
  @ApiProperty({ example: 'Dinas Koperasi, UMKM & Ekonomi', minLength: 2, maxLength: 120 })
  @Transform(pangkas)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'KOPERASI', description: 'Kunci unit; huruf besar, angka, dan garis bawah.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  @Matches(/^[A-Z0-9_]+$/, { message: 'code hanya boleh berisi huruf kapital, angka, dan garis bawah' })
  code!: string;
}

export class UpdateUnitKerjaDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 120 })
  @IsOptional()
  @Transform(pangkas)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ description: 'Menonaktifkan menyembunyikannya dari dropdown; pegawai yang sudah terdaftar di sini tidak dipindahkan.' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateJabatanDto {
  @ApiProperty({ example: 'Kepala Bidang', minLength: 2, maxLength: 120 })
  @Transform(pangkas)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ description: 'Boleh menerbitkan, menyunting, mengarsipkan, dan menghapus pengumuman.' })
  @IsOptional()
  @IsBoolean()
  canManageAnnouncements?: boolean;

  @ApiPropertyOptional({ description: 'Boleh melihat siapa saja yang sudah dan belum membaca pengumuman.' })
  @IsOptional()
  @IsBoolean()
  canViewAnnouncementReaders?: boolean;

  @ApiPropertyOptional({ description: 'Boleh menugaskan bacaan wajib dan membaca laporan kepatuhannya.' })
  @IsOptional()
  @IsBoolean()
  canAssignRequiredReadings?: boolean;

  @ApiPropertyOptional({ description: 'Urutan tampil di dropdown.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

// Ditulis ulang, bukan PartialType(CreateJabatanDto): setiap kolom di sini
// benar-benar opsional supaya mencentang satu wewenang tidak memaksa pengirim
// menyertakan nama dan seluruh centang lainnya.
export class UpdateJabatanDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 120 })
  @IsOptional()
  @Transform(pangkas)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ description: 'Boleh menerbitkan, menyunting, mengarsipkan, dan menghapus pengumuman.' })
  @IsOptional()
  @IsBoolean()
  canManageAnnouncements?: boolean;

  @ApiPropertyOptional({ description: 'Boleh melihat siapa saja yang sudah dan belum membaca pengumuman.' })
  @IsOptional()
  @IsBoolean()
  canViewAnnouncementReaders?: boolean;

  @ApiPropertyOptional({ description: 'Boleh menugaskan bacaan wajib dan membaca laporan kepatuhannya.' })
  @IsOptional()
  @IsBoolean()
  canAssignRequiredReadings?: boolean;

  @ApiPropertyOptional({ description: 'Urutan tampil di dropdown.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Menonaktifkan menyembunyikannya dari dropdown; pemegangnya yang sekarang tidak kehilangan apa pun.' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateRoleLabelDto {
  @ApiProperty({ example: 'Admin Dinas', minLength: 2, maxLength: 60 })
  @Transform(pangkas)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  label!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(pangkas)
  @IsString()
  @MaxLength(200)
  description?: string;
}
