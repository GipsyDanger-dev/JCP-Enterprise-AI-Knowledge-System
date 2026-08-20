import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { DatabaseModule } from './database/database.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthController } from './health.controller';
import { UsersModule } from './users/users.module';

@Module({
  imports: [DatabaseModule, AuthModule, UsersModule, DocumentsModule, ChatModule, AiModule],
  controllers: [HealthController],
})
export class AppModule {}

