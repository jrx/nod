import type { UsageDetails } from '../shared/execution.ts';

export interface ProviderUsageEvent extends UsageDetails {
  id: string;
  cacheWrite1hTokens?: number;
  pricingSignature?: string;
  turnId?: string;
}

export interface UsageTelemetry {
  record(usage: ProviderUsageEvent): void;
  shutdown(): Promise<void>;
}
