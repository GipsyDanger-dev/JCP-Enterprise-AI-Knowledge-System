import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ChatService } from './chat.service';
import { ChatQueryDto } from './dto/chat-query.dto';

@ApiTags('chat')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired access token' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.USER)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('query')
  @ApiOperation({ summary: 'Ask a question grounded in company documents' })
  @ApiOkResponse({ description: 'AI answer with citations' })
  query(
    @Body() body: ChatQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.chatService.query(body.question.trim(), actor, body.conversationId, body.fromSuggestion);
  }
}
