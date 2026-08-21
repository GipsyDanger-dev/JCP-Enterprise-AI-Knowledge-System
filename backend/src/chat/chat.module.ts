import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ChatController, ConversationsController],
  providers: [ChatService, ConversationsService],
  exports: [ChatService, ConversationsService],
})
export class ChatModule {}

