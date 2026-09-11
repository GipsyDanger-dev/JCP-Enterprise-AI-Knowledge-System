import { Module } from '@nestjs/common';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';
import { MessagingEventsService } from './messaging-events.service';
import { DatabaseModule } from '../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [DatabaseModule, NotificationsModule],
  controllers: [MessagingController],
  providers: [MessagingService, MessagingEventsService],
  exports: [MessagingService, MessagingEventsService],
})
export class MessagingModule {}
