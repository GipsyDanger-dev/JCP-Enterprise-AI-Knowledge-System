import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const ANNOUNCEMENT_IMAGE_PATTERN = /^data:image\/(?:avif|gif|jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export class UpdateAnnouncementDto {
  @ApiPropertyOptional({ maxLength: 180 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  title?: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Gambar pengumuman dalam format data URL. Kirim null untuk menghapus gambar.',
    maxLength: 14_000_000,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(14_000_000)
  @Matches(ANNOUNCEMENT_IMAGE_PATTERN, { message: 'Gambar pengumuman harus berupa data gambar yang didukung' })
  imageDataUrl?: string | null;
}
