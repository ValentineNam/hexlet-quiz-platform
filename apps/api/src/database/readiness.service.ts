import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class ReadinessService {
  private inFlight: { result: Promise<boolean> } | undefined;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  isReady(): Promise<boolean> {
    if (this.inFlight) return this.inFlight.result;
    let resolve!: (ready: boolean) => void;
    const state = {
      result: new Promise<boolean>((yes) => {
        resolve = yes;
      }),
    };
    this.inFlight = state;
    // One deadline/result per DB operation. After timeout the resolved false is
    // reused, without attaching more reactions to an unresolved Prisma promise.
    const timer = setTimeout(() => resolve(false), 1500);
    const complete = (ready: boolean) => {
      clearTimeout(timer);
      resolve(ready); // A late completion cannot change an already resolved false.
      if (this.inFlight === state) this.inFlight = undefined;
    };
    try {
      void this.prisma
        .$transaction(
          async (tx) => {
            await tx.$executeRaw`SET LOCAL statement_timeout = '750ms'`;
            await tx.$queryRaw`SELECT 1`;
          },
          { maxWait: 250, timeout: 1000 },
        )
        .then(
          () => complete(true),
          () => complete(false),
        );
    } catch {
      // Also contain a synchronous client failure, without exposing its details.
      complete(false);
    }
    return state.result;
  }
}
