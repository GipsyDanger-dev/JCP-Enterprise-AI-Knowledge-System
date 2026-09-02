import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateUserMessageDto } from './dto/create-user-message.dto';

@ApiTags('conversations')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired access token' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a conversation owned by the authenticated user' })
  @ApiCreatedResponse({ description: 'Empty conversation created' })
  @ApiBadRequestResponse({ description: 'Invalid conversation title' })
  create(
    @Body() input: CreateConversationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.conversationsService.create(input, actor);
  }

  @Get()
  @ApiOperation({ summary: 'List conversations owned by the authenticated user' })
  @ApiOkResponse({ description: 'Own conversations with message count and latest preview' })
  findAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.conversationsService.findAll(actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one owned conversation with messages and citations' })
  @ApiOkResponse({ description: 'Conversation history ordered from oldest to newest' })
  @ApiNotFoundResponse({ description: 'Conversation not found for the authenticated user' })
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.conversationsService.findOne(id, actor);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Append a USER message to an owned conversation' })
  @ApiCreatedResponse({ description: 'User message persisted; no AI response is generated' })
  @ApiBadRequestResponse({ description: 'Message is empty or exceeds 8000 characters' })
  @ApiNotFoundResponse({ description: 'Conversation not found for the authenticated user' })
  appendUserMessage(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: CreateUserMessageDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.conversationsService.appendUserMessage(id, input, actor);
  }
}
