import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { DatabaseModule } from './database/database.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthController } from './health.controller';
import { MessagingModule } from './messaging/messaging.module';
import { ProcessingJobsModule } from './processing-jobs/processing-jobs.module';
import { UsersModule } from './users/users.module';
import { RequiredReadingsModule } from './required-readings/required-readings.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    DatabaseModule,
    AuditLogsModule,
    AuthModule,
    UsersModule,
    DocumentsModule,
    ProcessingJobsModule,
    ChatModule,
    MessagingModule,
    AiModule,
    RequiredReadingsModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

