import { IsEnum, IsUUID, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'john.doe', minLength: 3, maxLength: 50 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9._-]+$/)
  username?: string;

  @ApiPropertyOptional({ example: 'EMP-0001', minLength: 2, maxLength: 50 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  employeeNumber?: string;

  @ApiPropertyOptional({ example: 'Human Resources', minLength: 2, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  division?: string;

  @ApiPropertyOptional({ example: 'HR Specialist', minLength: 2, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  jobTitle?: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({ enum: UserRole, example: 'PEGAWAI' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  isAdmin?: boolean;

  @ApiPropertyOptional({ example: 'https://example.com/photo.jpg', maxLength: 220000 })
  @IsOptional()
  @IsString()
  @MaxLength(220000)
  photoUrl?: string;

  @ApiPropertyOptional({
    description: 'Unit kerja / OPD penentu akses dokumen. Kosongkan bila pegawai belum ditempatkan.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4')
  unitKerjaId?: string;
}
