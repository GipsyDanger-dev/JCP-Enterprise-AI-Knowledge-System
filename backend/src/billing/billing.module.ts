import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { SumopodSandboxAdapter } from './sumopod-sandbox.adapter';

@Module({ controllers: [BillingController], providers: [BillingService, SumopodSandboxAdapter], exports: [BillingService] })
export class BillingModule {}
