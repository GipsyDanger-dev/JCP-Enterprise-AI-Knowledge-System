import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { AdminOnly } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  MAX_DOCUMENT_FILE_SIZE,
  UploadedDocumentFile,
} from './document-file.validator';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { CreateDocumentCategoryDto } from './dto/create-document-category.dto';
import { UpdateDocumentAccessDto } from './dto/update-document-access.dto';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  // Tanpa @AdminOnly: ADMIN_UNIT juga boleh mengunggah, tetapi hanya untuk unit
  // kerjanya sendiri. Batasnya ditegakkan di service, karena baru bisa dinilai
  // setelah kategori dan unit tujuan pada body permintaan diketahui.
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_FILE_SIZE, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a PDF or DOCX and queue it for processing' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        title: { type: 'string', maxLength: 200 },
        categoryId: { type: 'string', format: 'uuid' },
        unitKerjaId: { type: 'string', format: 'uuid' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Document, version, binary file, and queued job created' })
  @ApiBadRequestResponse({ description: 'Missing, invalid, empty, or oversized file' })
  @ApiPayloadTooLargeResponse({ description: 'The uploaded file exceeds the 10 MB limit' })
  @ApiConflictResponse({ description: 'The same file is already active' })
  @ApiForbiddenResponse({ description: 'Bukan admin, atau mengunggah untuk unit kerja/kategori di luar wewenangnya' })
  create(
    @Body() input: CreateDocumentDto,
    @UploadedFile() file: UploadedDocumentFile,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.documentsService.create(input, file, actor);
  }

  @Get()
  @ApiOperation({ summary: 'List document metadata without loading binary content' })
  @ApiOkResponse({ description: 'Admin melihat semua dokumen aktif; pegawai hanya dokumen READY pada kategori yang boleh diaksesnya, tanpa rancangan' })
  findAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.documentsService.findAll(actor);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Kategori dokumen yang bisa diakses aktor' })
  listCategories(@CurrentUser() actor: AuthenticatedUser) {
    return this.documentsService.listCategories(actor);
  }

  @Post('categories')
  @AdminOnly()
  @ApiOperation({ summary: 'Create a document category' })
  @ApiCreatedResponse({ description: 'Document category created' })
  @ApiForbiddenResponse({ description: 'Only ADMIN can create document categories' })
  createCategory(@Body() input: CreateDocumentCategoryDto) {
    return this.documentsService.createCategory(input);
  }

  // Tanpa @AdminOnly, sama seperti unggah: ADMIN_UNIT boleh mengatur dokumen
  // unitnya sendiri. Batas wewenangnya ditegakkan di service, karena baru bisa
  // dinilai setelah unit kerja dokumen sekarang dan unit tujuannya diketahui.
  @Patch(':id/access')
  @ApiOperation({ summary: 'Ubah kategori dan penanda unit kerja sebuah dokumen' })
  @ApiOkResponse({ description: 'Kategori dan penanda unit kerja tersimpan' })
  @ApiBadRequestResponse({ description: 'Unit kerja tidak dikenal atau sudah tidak aktif' })
  @ApiNotFoundResponse({ description: 'Dokumen tidak ada, atau tidak boleh diakses aktor ini' })
  @ApiForbiddenResponse({ description: 'Dokumen atau unit tujuan di luar wewenang aktor' })
  updateAccess(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: UpdateDocumentAccessDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.documentsService.updateAccess(id, input, actor);
  }

  // Pengunggah perlu memantau proses dokumennya sendiri, jadi bukan hanya
  // super admin. Penyaring keterlihatan di service yang membatasi cakupannya.
  @Get(':id/status')
  @ApiOperation({ summary: 'Get the latest processing status for a document' })
  @ApiOkResponse({ description: 'Document and latest job status' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  @ApiForbiddenResponse({ description: 'Bukan pengunggah dokumen' })
  getStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.documentsService.getStatus(id, actor);
  }

  @Get(':id/chunks')
  @ApiOperation({ summary: 'Get document chunks for preview' })
  @ApiOkResponse({ description: 'Document chunks with text content' })
  @ApiNotFoundResponse({ description: 'Dokumen tidak ada, atau tidak boleh diakses aktor ini' })
  getChunks(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.documentsService.getChunks(id, actor);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download the document binary file' })
  @ApiOkResponse({ description: 'Document binary content' })
  @ApiNotFoundResponse({ description: 'Dokumen tidak ada, atau tidak boleh diakses aktor ini' })
  async download(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<StreamableFile> {
    const file = await this.documentsService.download(id, actor);
    return new StreamableFile(file.content, {
      type: file.mimeType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      length: file.content.byteLength,
    });
  }

  // ADMIN_UNIT boleh menghapus dokumen unitnya sendiri; batasnya di service.
  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete metadata and remove the stored binary file' })
  @ApiOkResponse({ description: 'Document deleted and active processing job stopped' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  @ApiForbiddenResponse({ description: 'Dokumen di luar wewenang unit kerja aktor' })
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.documentsService.remove(id, actor);
  }
}
