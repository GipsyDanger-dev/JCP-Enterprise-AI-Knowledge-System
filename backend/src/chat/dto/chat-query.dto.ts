import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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
}
