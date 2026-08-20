import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ChatController } from './chat.controller';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [AiModule],
  controllers: [ChatController, ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ChatModule {}

