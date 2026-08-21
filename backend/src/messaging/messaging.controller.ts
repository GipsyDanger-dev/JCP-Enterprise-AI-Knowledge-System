import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { MessagingService } from './messaging.service';
import { UserRole } from '@prisma/client';

@ApiTags('messaging')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('messaging')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  /** Employee: get or create their conversation with admin */
  @Get('employee/:employeeId')
  getEmployeeConversation(@Param('employeeId') employeeId: string) {
    return this.messagingService.getEmployeeConversation(employeeId);
  }

  /** Admin: list all conversations */
  @Get('conversations')
  listConversations() {
    return this.messagingService.listConversations();
  }

  /** Get messages in a conversation */
  @Get(':conversationId/messages')
  getMessages(@Param('conversationId') conversationId: string) {
    return this.messagingService.getMessages(conversationId);
  }

  /** Send a message — sender is determined from JWT, not body */
  @Post(':conversationId/messages')
  sendMessage(
    @Param('conversationId') conversationId: string,
    @Body() body: { content: string; attachments?: unknown },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    // Determine sender from JWT role
    const sender = actor.role === UserRole.ADMIN ? 'admin' : 'employee';
    const senderName = actor.displayName ?? (actor.role === UserRole.ADMIN ? 'Admin' : 'Employee');
    return this.messagingService.sendMessage(
      conversationId,
      sender,
      senderName,
      body.content,
      body.attachments,
    );
  }

  /** Reset unread count */
  @Put(':conversationId/read')
  markAsRead(@Param('conversationId') conversationId: string) {
    return this.messagingService.markAsRead(conversationId);
  }
}
