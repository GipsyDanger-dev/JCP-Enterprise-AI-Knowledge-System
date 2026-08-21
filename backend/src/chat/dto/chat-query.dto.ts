import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ChatQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  question!: string;

  @IsOptional()
  @IsUUID('4')
  conversationId?: string;
}
