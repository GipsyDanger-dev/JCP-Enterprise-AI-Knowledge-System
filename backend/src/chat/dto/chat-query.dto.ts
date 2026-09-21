import { ArrayMaxSize, IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ChatQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  question!: string;

  @IsOptional()
  @IsUUID('4')
  conversationId?: string;

  // Pertanyaan yang datang dari klik tombol saran tidak boleh dibalas dengan
  // pertanyaan balik: aplikasi akan terlihat mempertanyakan usulannya sendiri.
  @IsOptional()
  @IsBoolean()
  fromSuggestion?: boolean;

  // Bahan yang melahirkan tombol saran ini, dikirim balik saat tombolnya
  // diklik. Isinya tetap disaring hak akses sebelum dipakai, jadi yang bisa
  // dititipkan di sini paling jauh hanya potongan yang memang boleh dilihat
  // pengirimnya.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  contextChunkIds?: string[];
}
