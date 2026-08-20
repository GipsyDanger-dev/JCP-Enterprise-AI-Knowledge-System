import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiGatewayTimeoutResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ConversationsService } from './conversations.service';
import { ChatQueryDto } from './dto/chat-query.dto';

@ApiTags('chat')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired access token' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.USER)
@Controller('chat')
export class ChatController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post('query')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ask the AI service and persist the conversation' })
  @ApiOkResponse({ description: 'Grounded answer or an explicit no-answer result' })
  @ApiBadRequestResponse({ description: 'Invalid question or conversation ID' })
  @ApiNotFoundResponse({ description: 'Conversation not found for the authenticated user' })
  @ApiBadGatewayResponse({ description: 'AI service returned an error or invalid response' })
  @ApiGatewayTimeoutResponse({ description: 'AI service request timed out' })
  @ApiServiceUnavailableResponse({ description: 'AI service is not configured' })
  query(
    @Body() input: ChatQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.conversationsService.query(input, actor);
  }
}
