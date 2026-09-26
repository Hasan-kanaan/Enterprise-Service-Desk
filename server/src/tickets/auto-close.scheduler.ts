import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AutoCloseService } from './auto-close.service';

export const AUTO_CLOSE_SWEEP_INTERVAL_MS = 10 * 60 * 1000;

@Injectable()
export class AutoCloseScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutoCloseScheduler.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;

  constructor(private readonly autoClose: AutoCloseService) {}

  onModuleInit() {
    // One process-wide sweep trigger; no ticket timers or persisted deadlines.
    this.timer = setInterval(() => {
      void this.trigger();
    }, AUTO_CLOSE_SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  trigger() {
    if (this.running) return this.running;
    this.running = this.autoClose
      .runSweep(new Date())
      .then(({ closed }) => {
        if (closed) this.logger.log(`Automatically closed ${closed} tickets`);
      })
      .catch((error: unknown) => {
        this.logger.error('Auto-close sweep failed', error);
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.running;
  }
}
