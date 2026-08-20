import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('query')
  query(@Body() body: { question?: string }) {
    const question = body.question?.trim();
    if (!question) throw new BadRequestException('question must not be empty');
    return this.chatService.query(question);
  }
}
