import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDocumentDto {
  @ApiPropertyOptional({ description: 'Defaults to the uploaded filename' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Document collection (e.g. Operations, IT & Security)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  collection?: string;
}
