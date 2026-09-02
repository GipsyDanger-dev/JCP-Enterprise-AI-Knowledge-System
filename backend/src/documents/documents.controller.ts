import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
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
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminOnly, Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  MAX_DOCUMENT_FILE_SIZE,
  UploadedDocumentFile,
} from './document-file.validator';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { CreateDocumentCategoryDto } from './dto/create-document-category.dto';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @AdminOnly()
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
  @ApiOperation({ summary: 'List document metadata without loading binary content' })
  @ApiOkResponse({ description: 'ADMIN sees active documents; USER sees only READY documents' })
  findAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.documentsService.findAll(actor);
  }

  @Get('categories')
  @Roles('admin', 'user')
  @ApiOperation({ summary: 'List document categories' })
  listCategories() {
    return this.documentsService.listCategories();
  }

  @Post('categories')
  @AdminOnly()
  @ApiOperation({ summary: 'Create a document category' })
  @ApiCreatedResponse({ description: 'Document category created' })
  @ApiForbiddenResponse({ description: 'Only ADMIN can create document categories' })
  createCategory(@Body() input: CreateDocumentCategoryDto) {
    return this.documentsService.createCategory(input);
  }

  @Get(':id/status')
  @AdminOnly()
  @ApiOperation({ summary: 'Get the latest processing status for a document' })
  @ApiOkResponse({ description: 'Document and latest job status' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  @ApiForbiddenResponse({ description: 'Only ADMIN can inspect processing status' })
  getStatus(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.documentsService.getStatus(id);
  }

  @Get(':id/chunks')
  @ApiOperation({ summary: 'Get document chunks for preview' })
  @ApiOkResponse({ description: 'Document chunks with text content' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  getChunks(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.documentsService.getChunks(id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download the document binary file' })
  @ApiOkResponse({ description: 'Document binary content' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  async download(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<StreamableFile> {
    const file = await this.documentsService.download(id);
    return new StreamableFile(file.content, {
      type: file.mimeType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      length: file.content.byteLength,
    });
  }

  @Delete(':id')
  @AdminOnly()
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
