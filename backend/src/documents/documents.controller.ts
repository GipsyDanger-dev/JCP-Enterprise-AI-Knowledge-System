import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  MAX_DOCUMENT_FILE_SIZE,
  UploadedDocumentFile,
} from './document-file.validator';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_FILE_SIZE, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a PDF or DOCX and queue it for processing' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        title: { type: 'string', maxLength: 200 },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Document, version, binary file, and queued job created' })
  @ApiBadRequestResponse({ description: 'Missing, invalid, empty, or oversized file' })
  @ApiPayloadTooLargeResponse({ description: 'The uploaded file exceeds the 10 MB limit' })
  @ApiConflictResponse({ description: 'The same file is already active' })
  @ApiForbiddenResponse({ description: 'Only ADMIN can upload documents' })
  create(
    @Body() input: CreateDocumentDto,
    @UploadedFile() file: UploadedDocumentFile,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.documentsService.create(input, file, actor);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.USER)
  @ApiOperation({ summary: 'List document metadata without loading binary content' })
  @ApiOkResponse({ description: 'ADMIN sees active documents; USER sees only READY documents' })
  findAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.documentsService.findAll(actor);
  }

  @Get(':id/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get the latest processing status for a document' })
  @ApiOkResponse({ description: 'Document and latest job status' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  @ApiForbiddenResponse({ description: 'Only ADMIN can inspect processing status' })
  getStatus(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.documentsService.getStatus(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Soft-delete metadata and remove the stored binary file' })
  @ApiOkResponse({ description: 'Document deleted and active processing job stopped' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  @ApiForbiddenResponse({ description: 'Only ADMIN can delete documents' })
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.documentsService.remove(id, actor);
  }
}
