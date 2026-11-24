import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ReadinessService } from './readiness.service';

@Controller()
export class ReadinessController {
  constructor(
    @Inject(ReadinessService) private readonly readiness: ReadinessService,
  ) {}

  @Get('ready')
  async ready(): Promise<{ status: 'ready' }> {
    if (!(await this.readiness.isReady())) {
      throw new ServiceUnavailableException({ status: 'not_ready' });
    }
    return { status: 'ready' };
  }
}
