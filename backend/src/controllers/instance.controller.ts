import { Request, Response } from 'express';
import {
  getInstance,
  getInstanceStatus,
  listInstanceStatuses,
  listInstances,
  proxyInstanceReset,
  UpstreamResponse,
} from '../services/instance.service';

/**
 * Instance proxy response shaping.
 *
 * Only the upstream content type and body are copied back to the browser.
 * Hop-by-hop headers (connection, keep-alive, transfer-encoding, te, trailer,
 * upgrade, proxy-authenticate/authorization) are stripped by construction —
 * we never iterate upstream headers — and Set-Cookie is deliberately never
 * forwarded: a challenge runs on its own origin and must not be able to set
 * cookies on the platform origin (that would let it touch or spoof the
 * platform session). Every proxied response is marked no-store.
 */
function writeUpstreamResponse(res: Response, upstream: UpstreamResponse): void {
  res.setHeader('Cache-Control', 'no-store');
  const status = upstream.status >= 100 && upstream.status <= 599 ? upstream.status : 502;
  res.status(status);

  const contentType = upstream.contentType.split(';')[0].trim().toLowerCase();
  if (contentType === 'application/json' || contentType === 'text/json') {
    try {
      res.json(JSON.parse(upstream.bodyText));
      return;
    } catch {
      // Fall through and forward the raw text of a malformed JSON body.
    }
  }
  if (contentType.startsWith('text/') || contentType === 'application/octet-stream') {
    res.type(contentType).send(upstream.bodyText);
    return;
  }
  res.send(upstream.bodyText);
}

/** GET /api/instances — registry entries with live, timeout-tolerant health. */
export async function listInstancesHandler(_req: Request, res: Response): Promise<void> {
  const instances = await listInstanceStatuses();
  res.setHeader('Cache-Control', 'no-store');
  res.json({ instances });
}

/** GET /api/instances/:slug/status — single health check (200 + status field). */
export async function getInstanceStatusHandler(req: Request, res: Response): Promise<void> {
  const instance = getInstance(req.params.slug);
  const status = await getInstanceStatus(instance);
  res.setHeader('Cache-Control', 'no-store');
  res.json(status);
}

/** POST /api/instances/:slug/reset — proxy the registry resetPath (HTTP, not shell). */
export async function resetInstanceHandler(req: Request, res: Response): Promise<void> {
  const instance = getInstance(req.params.slug);
  const upstream = await proxyInstanceReset(instance);
  writeUpstreamResponse(res, upstream);
}

/** GET /api/admin/instances — every entry (incl. disabled) plus health. */
export async function listAdminInstancesHandler(_req: Request, res: Response): Promise<void> {
  const statuses = await listInstanceStatuses();
  const details = listInstances().map((entry) => {
    const status = statuses.find((candidate) => candidate.slug === entry.slug);
    return {
      ...entry,
      status: status?.status ?? 'disabled',
      httpStatus: status?.httpStatus,
      latencyMs: status?.latencyMs,
      error: status?.error,
    };
  });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ instances: details });
}

/** POST /api/admin/instances/:slug/reset — admin-triggered proxied reset. */
export async function adminResetInstanceHandler(req: Request, res: Response): Promise<void> {
  const instance = getInstance(req.params.slug);
  const upstream = await proxyInstanceReset(instance);
  writeUpstreamResponse(res, upstream);
}
