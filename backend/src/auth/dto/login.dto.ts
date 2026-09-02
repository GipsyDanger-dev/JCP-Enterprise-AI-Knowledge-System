import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  // Existing accounts without a username may still authenticate with their legacy email.
  @MaxLength(254)
  username!: string;

  @ApiProperty({ example: 'your-password', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
