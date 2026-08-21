import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MessagingService } from './messaging.service';

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

  /** Send a message */
  @Post(':conversationId/messages')
  sendMessage(
    @Param('conversationId') conversationId: string,
    @Body() body: { content: string; sender?: string; senderName?: string; attachments?: unknown },
  ) {
    return this.messagingService.sendMessage(
      conversationId,
      body.sender ?? 'employee',
      body.senderName ?? 'Employee',
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
