import { Request, Response, NextFunction } from 'express';
import { Role, SecurityEventType } from '../constants/enums';
import { logger } from '../utils/logger';
import { recordSecurityEvent } from '../services/securityEvent.service';

/**
 * Safe administrator audit trail. Request bodies are never persisted or
 * logged; the middleware derives only an allow-listed action and challenge
 * target from the route. Security events survive challenge deletion because
 * targetChallengeId is a nullable scalar without a cascading FK.
 */
export function adminAudit(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();

  res.on('finish', () => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    if (!req.user || req.user.role !== Role.ADMIN) return;
    // Audit every outcome, including failures — a rejected administrator
    // mutation is exactly the kind of event an audit trail exists to show.
    const succeeded = res.statusCode < 400;

    const targetId = typeof req.params.id === 'string' ? req.params.id : undefined;
    let action = `${req.method.toLowerCase()} ${req.path}`;
    let eventType: SecurityEventType | null = null;

    if (req.path === '/challenges' && req.method === 'POST') {
      action = 'admin.challenge.create';
      eventType = SecurityEventType.ADMIN_CHALLENGE_CREATED;
    } else if (req.path.match(/^\/challenges\/[^/]+\/publish$/) && req.method === 'POST') {
      action = 'admin.challenge.publish';
      eventType = SecurityEventType.ADMIN_CHALLENGE_PUBLISHED;
    } else if (req.path.match(/^\/challenges\/[^/]+\/unpublish$/) && req.method === 'POST') {
      action = 'admin.challenge.unpublish';
      eventType = SecurityEventType.ADMIN_CHALLENGE_UNPUBLISHED;
    } else if (req.path.match(/^\/challenges\/[^/]+\/archive$/) && req.method === 'POST') {
      action = 'admin.challenge.archive';
      eventType = SecurityEventType.ADMIN_CHALLENGE_ARCHIVED;
    } else if (req.path.match(/^\/challenges\/[^/]+$/) && req.method === 'PATCH') {
      const flagChanged = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'flag')
        || Object.prototype.hasOwnProperty.call(req.body ?? {}, 'caseSensitive')
        || Object.prototype.hasOwnProperty.call(req.body ?? {}, 'flagMode');
      action = flagChanged ? 'admin.challenge.flag_update' : 'admin.challenge.update';
      eventType = flagChanged ? SecurityEventType.ADMIN_CHALLENGE_FLAG_CHANGED : SecurityEventType.ADMIN_CHALLENGE_UPDATED;
    } else if (req.path.match(/^\/challenges\/[^/]+\/reset-solves$/) && req.method === 'POST') {
      action = 'admin.challenge.reset_solves';
    } else if (req.path.match(/^\/challenges\/[^/]+$/) && req.method === 'DELETE') {
      action = 'admin.challenge.delete';
      eventType = SecurityEventType.ADMIN_CHALLENGE_DELETED;
    } else if (req.path.match(/^\/challenges\/[^/]+\/hints(?:\/[^/]+)?$/)) {
      action = `admin.challenge.hint.${req.method.toLowerCase()}`;
      eventType = SecurityEventType.ADMIN_HINT_CHANGED;
    } else if (req.path.match(/^\/challenges\/[^/]+\/writeup$/)) {
      action = `admin.challenge.writeup.${req.method.toLowerCase()}`;
      eventType = SecurityEventType.ADMIN_WRITEUP_CHANGED;
    } else if (req.path.match(/^\/challenges\/[^/]+\/files(?:\/[^/]+)?$/)) {
      action = `admin.challenge.file.${req.method.toLowerCase()}`;
      eventType = SecurityEventType.ADMIN_CHALLENGE_FILE_CHANGED;
    } else if (req.path.startsWith('/categories')) {
      action = `admin.category.${req.method.toLowerCase()}`;
    } else if (req.path.startsWith('/difficulties')) {
      action = `admin.difficulty.${req.method.toLowerCase()}`;
    } else if (req.path.startsWith('/badges')) {
      action = `admin.badge.${req.method.toLowerCase()}`;
    } else if (req.path.startsWith('/events')) {
      action = `admin.event.${req.method.toLowerCase()}`;
    } else if (req.path.startsWith('/community')) {
      action = `admin.community.${req.method.toLowerCase()}`;
    } else if (req.path.startsWith('/teams')) {
      action = `admin.team.${req.method.toLowerCase()}`;
    } else if (req.path.startsWith('/scores')) {
      action = 'admin.score.adjust';
    } else if (req.path.startsWith('/submissions') || req.path.startsWith('/first-bloods')) {
      // Read-only monitoring surfaces — kept for the structured log only.
      action = `admin.monitor.${req.method.toLowerCase()}`;
    }

    logger.info('Admin audit event', {
      actorId: req.user.id,
      actorRole: req.user.role,
      action,
      targetId,
      path: req.path,
      method: req.method,
      status: res.statusCode,
      result: succeeded ? 'success' : 'failure',
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });

    // SecurityEvent rows are written only for successful mutations: the
    // SecurityEventType enum models committed actions (e.g. the challenge
    // was deleted), and recording it for a failed request would falsify the
    // event stream. Failures are captured by the structured log above with
    // result: 'failure'. (The enum has no generic admin-event/badge/community
    // variants — those paths are covered by the log; adding enum values would
    // require a schema migration.)
    if (eventType && succeeded) {
      void recordSecurityEvent(eventType, {
        userId: req.user.id,
        targetChallengeId: targetId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }
  });

  next();
}
