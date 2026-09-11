import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsUUID,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'employee', maxLength: 50 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9._-]+$/)
  username!: string;

  @ApiProperty({ example: 'EMP-0001', minLength: 2, maxLength: 50 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  employeeNumber!: string;

  @ApiProperty({ example: 'Human Resources', minLength: 2, maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  division!: string;

  // Opsional sejak jabatan jadi tabel: form mengirim jabatanId, dan namanya
  // disalin ke sini oleh service. Tetap diterima sebagai teks supaya pemanggil
  // lama tidak patah.
  @ApiPropertyOptional({ example: 'HR Specialist', minLength: 2, maxLength: 100 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  jobTitle?: string;

  @ApiProperty({ example: 'Employee Name', minLength: 2, maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName!: string;

  @ApiProperty({ example: 'replace-with-a-strong-password', minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ enum: UserRole, default: 'PEGAWAI' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'Baris jabatan penentu wewenang pengumuman dan bacaan wajib. Bila diisi, jobTitle diambil dari namanya.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4')
  jabatanId?: string;

  @ApiPropertyOptional({
    description: 'Unit kerja / OPD penentu akses dokumen. Kosongkan bila pegawai belum ditempatkan.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4')
  unitKerjaId?: string;
}
