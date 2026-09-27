import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import categoriesRoutes from './categories.routes';
import difficultiesRoutes from './difficulties.routes';
import challengesRoutes from './challenges.routes';
import leaderboardRoutes from './leaderboard.routes';
import usersRoutes from './users.routes';
import adminRoutes from './admin.routes';
import phase7Routes from './phase7.routes';
import adminPhase7Routes from './admin.phase7.routes';
import adminBadgesRoutes from './admin.badges.routes';
import badgesRoutes from './badges.routes';
import notificationRoutes from './notification.routes';
import gamificationRoutes from './gamification.routes';
import socialRoutes from './social.routes';
import usersSocialRoutes from './users.social.routes';
import adminCommunityRoutes from './admin.community.routes';
import eventsRoutes from './events.routes';
import adminEventsRoutes from './admin.events.routes';
import teamsRoutes from './teams.routes';
import adminTeamsRoutes from './admin.teams.routes';
import adminMonitorRoutes from './admin.monitor.routes';
import instancesRoutes from './instances.routes';
import adminInstancesRoutes from './admin.instances.routes';
import realtimeRoutes from './realtime.routes';
import adminRealtimeRoutes from './admin.realtime.routes';
import adminVerifyRoutes from './admin.verify.routes';
import adminSystemRoutes from './admin.system.routes';

/**
 * Single mount point for every route group, attached to the app as
 * `/api` in app.ts. New route groups get added here as later phases build
 * them out as later phases add route groups.
 */
const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/categories', categoriesRoutes);
router.use('/difficulties', difficultiesRoutes);
router.use('/challenges', challengesRoutes);
router.use('/leaderboard', leaderboardRoutes);
router.use('/users', usersRoutes);
router.use('/users', usersSocialRoutes);
router.use('/admin', adminRoutes);
router.use('/admin', adminPhase7Routes);
router.use('/admin', adminBadgesRoutes);
router.use('/admin', adminCommunityRoutes);
router.use('/admin', adminEventsRoutes);
router.use('/admin', adminRealtimeRoutes);
router.use('/admin', adminTeamsRoutes);
router.use('/admin', adminMonitorRoutes);
router.use('/challenges', phase7Routes);
router.use('/badges', badgesRoutes);
router.use('/community', socialRoutes);
router.use('/', notificationRoutes);
router.use('/gamification', gamificationRoutes);
router.use('/events', eventsRoutes);
router.use('/teams', teamsRoutes);
router.use('/instances', instancesRoutes);
router.use('/admin', adminInstancesRoutes);
router.use('/admin', adminVerifyRoutes);
router.use('/admin', adminSystemRoutes);
router.use('/realtime', realtimeRoutes);



export default router;
