import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CompleteProcessingJobDto } from './dto/complete-processing-job.dto';
import { WorkerTokenGuard } from './guards/worker-token.guard';
import { ProcessingJobsService } from './processing-jobs.service';

@ApiTags('internal processing jobs')
@ApiSecurity('worker-token')
@ApiUnauthorizedResponse({ description: 'Missing or invalid X-Worker-Token' })
@UseGuards(WorkerTokenGuard)
@Controller('internal/processing-jobs')
export class ProcessingJobsController {
  constructor(private readonly processingJobsService: ProcessingJobsService) {}

  @Post('claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Claim the oldest queued document-processing job' })
  @ApiOkResponse({ description: 'Job claimed and changed to PROCESSING' })
  @ApiNotFoundResponse({ description: 'No queued job is currently available' })
  claim() {
    return this.processingJobsService.claim();
  }

  @Get(':id/file')
  @ApiOperation({ summary: 'Download the binary file for a claimed job' })
  @ApiProduces(
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )
  @ApiOkResponse({
    description: 'Original document binary',
    content: {
      'application/octet-stream': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Job, document, or binary file not found' })
  @ApiConflictResponse({ description: 'The job has not been claimed or is already finished' })
  async getFile(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<StreamableFile> {
    const file = await this.processingJobsService.getFile(id);
    return new StreamableFile(file.content, {
      type: file.mimeType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.originalFilename)}`,
      length: file.content.byteLength,
    });
  }

  @Patch(':id/result')
  @ApiOperation({ summary: 'Report a claimed job as COMPLETED or FAILED' })
  @ApiOkResponse({ description: 'Job and document statuses updated atomically' })
  @ApiBadRequestResponse({ description: 'FAILED result does not include an error message' })
  @ApiNotFoundResponse({ description: 'Job not found' })
  @ApiConflictResponse({ description: 'Invalid job transition or deleted document' })
  complete(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: CompleteProcessingJobDto,
  ) {
    return this.processingJobsService.complete(id, input);
  }
}
