import type { Express } from 'express';

import type { CoreServicesManager } from './adapters/core-services.js';
import * as logger from './utils/logging.js';

export type MCPHealthStatus = Awaited<ReturnType<CoreServicesManager['getHealthStatus']>>;
type HealthStatusProvider = Pick<CoreServicesManager, 'getHealthStatus'>;

function isHealthyStatus(healthStatus: MCPHealthStatus): boolean {
  return healthStatus.initialized && Object.values(healthStatus.services).every(Boolean);
}

export function buildHealthzResponse(healthStatus: MCPHealthStatus): {
  statusCode: number;
  body: { ok: boolean };
} {
  const healthy = isHealthyStatus(healthStatus);
  return {
    statusCode: healthy ? 200 : 503,
    body: { ok: healthy }
  };
}

export function registerHealthzRoute(app: Express, healthProvider: HealthStatusProvider): void {
  app.get('/healthz', async (_req, res) => {
    try {
      const healthStatus = await healthProvider.getHealthStatus();
      const { statusCode, body } = buildHealthzResponse(healthStatus);
      res.status(statusCode).json(body);
    } catch (error) {
      logger.error('Health check failed:', error as Error);
      res.status(503).json({ ok: false });
    }
  });
}
