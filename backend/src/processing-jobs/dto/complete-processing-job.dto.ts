import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum ProcessingJobResultStatus {
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export class CompleteProcessingJobDto {
  @ApiProperty({ enum: ProcessingJobResultStatus })
  @IsEnum(ProcessingJobResultStatus)
  status: ProcessingJobResultStatus;

  @ApiPropertyOptional({
    description: 'Required when status is FAILED',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  errorMessage?: string;
}
