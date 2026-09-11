import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const ANNOUNCEMENT_IMAGE_PATTERN = /^data:image\/(?:avif|gif|jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export class CreateAnnouncementDto {
  @ApiProperty({ example: 'Perubahan jadwal operasional', maxLength: 180 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  title!: string;

  @ApiProperty({ example: 'Mulai Senin, jam operasional akan berubah.', maxLength: 4000 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  body!: string;

  @ApiPropertyOptional({
    description: 'Gambar pengumuman dalam format data URL PNG, JPG, WebP, GIF, atau AVIF.',
    maxLength: 14_000_000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(14_000_000)
  @Matches(ANNOUNCEMENT_IMAGE_PATTERN, { message: 'Gambar pengumuman harus berupa data gambar yang didukung' })
  imageDataUrl?: string | null;
}
