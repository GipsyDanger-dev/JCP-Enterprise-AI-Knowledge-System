import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUserMessageDto {
  @ApiProperty({
    example: 'How many annual leave days are available?',
    minLength: 1,
    maxLength: 8000,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  content!: string;
}
