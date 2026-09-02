import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDocumentCategoryDto {
  @ApiProperty({ example: 'Human Resources' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;
}
