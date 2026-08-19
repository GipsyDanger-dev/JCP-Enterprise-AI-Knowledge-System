import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

interface WorkerRequest {
  headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class WorkerTokenGuard implements CanActivate {
  private readonly expectedTokenHash: Buffer;

  constructor() {
    const workerToken = process.env.WORKER_TOKEN?.trim();
    if (!workerToken) throw new Error('WORKER_TOKEN is required');
    this.expectedTokenHash = this.hash(workerToken);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<WorkerRequest>();
    const header = request.headers['x-worker-token'];
    const suppliedToken = Array.isArray(header) ? header[0] : header;

    if (!suppliedToken || !timingSafeEqual(this.hash(suppliedToken), this.expectedTokenHash)) {
      throw new UnauthorizedException('Valid worker token required');
    }

    return true;
  }

  private hash(value: string): Buffer {
    return createHash('sha256').update(value).digest();
  }
}
