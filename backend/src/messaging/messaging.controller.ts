import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { MessagingService } from './messaging.service';
import { UserRole } from '@prisma/client';
import { isAdminRole } from '../auth/role.utils';

@ApiTags('messaging')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('messaging')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  /** Employee: get or create their conversation with admin */
  @Get('employee/:employeeId')
  getEmployeeConversation(
    @Param('employeeId', new ParseUUIDPipe({ version: '4' })) employeeId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.messagingService.getEmployeeConversation(employeeId, actor);
  }

  /** Admin: list all conversations */
  @Get('conversations')
  @Roles(UserRole.ADMIN)
  listConversations() {
    return this.messagingService.listConversations();
  }

  /** Get messages in a conversation */
  @Get(':conversationId/messages')
  getMessages(
    @Param('conversationId', new ParseUUIDPipe({ version: '4' })) conversationId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.messagingService.getMessages(conversationId, actor);
  }

  /** Send a message — sender is determined from JWT, not body */
  @Post(':conversationId/messages')
  sendMessage(
    @Param('conversationId', new ParseUUIDPipe({ version: '4' })) conversationId: string,
    @Body() body: { content: string; attachments?: unknown },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const content = body.content?.trim() ?? '';
    if (!content && (!Array.isArray(body.attachments) || body.attachments.length === 0)) throw new BadRequestException('content or attachment is required');
    if (content.length > 8000) throw new BadRequestException('content must not exceed 8000 characters');
    const sender = isAdminRole(actor.role) ? 'admin' : 'employee';
    const senderName = actor.displayName ?? (isAdminRole(actor.role) ? 'Admin' : 'Employee');
    return this.messagingService.sendMessage(
      conversationId,
      sender,
      senderName,
      content,
      body.attachments,
      actor,
    );
  }

  @Patch('messages/:messageId')
  editMessage(@Param('messageId', new ParseUUIDPipe({ version: '4' })) messageId: string, @Body() body: { content: string }, @CurrentUser() actor: AuthenticatedUser) {
    const content = body.content?.trim();
    if (!content) throw new BadRequestException('content must not be empty');
    if (content.length > 8000) throw new BadRequestException('content must not exceed 8000 characters');
    return this.messagingService.editMessage(messageId, content, actor);
  }

  @Delete('messages/:messageId')
  deleteMessage(@Param('messageId', new ParseUUIDPipe({ version: '4' })) messageId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.messagingService.deleteMessage(messageId, actor);
  }

  /** Reset unread count */
  @Put(':conversationId/read')
  markAsRead(
    @Param('conversationId', new ParseUUIDPipe({ version: '4' })) conversationId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.messagingService.markAsRead(conversationId, actor);
  }
}
