import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminOnly } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuditLogsService } from './audit-logs.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';

@ApiTags('audit logs')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired access token' })
@ApiForbiddenResponse({ description: 'Only ADMIN can read audit logs' })
@UseGuards(JwtAuthGuard, RolesGuard)
@AdminOnly()
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @ApiOperation({ summary: 'List and filter security-sensitive Backend activity' })
  @ApiOkResponse({ description: 'Paginated audit logs ordered from newest to oldest' })
  findAll(@Query() query: ListAuditLogsDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.auditLogsService.findAll(query, actor.workspaceId);
  }
}
