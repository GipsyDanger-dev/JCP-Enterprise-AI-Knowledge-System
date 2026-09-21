import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Hanya namanya yang bisa diubah. Kuncinya (`key`) ikut dihitung ulang dari
 * nama itu di service, bukan dikirim klien: kunci yang boleh diisi sendiri
 * membuka celah dua kategori berbeda berebut kunci yang sama.
 */
export class UpdateDocumentCategoryDto {
  @ApiProperty({ example: 'Kepegawaian' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;
}
