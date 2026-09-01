import { Module } from '@nestjs/common';
import { RequiredReadingsController } from './required-readings.controller';
import { RequiredReadingsService } from './required-readings.service';
import { NotificationsModule } from '../notifications/notifications.module';
@Module({ imports: [NotificationsModule], controllers: [RequiredReadingsController], providers: [RequiredReadingsService] })
export class RequiredReadingsModule {}
