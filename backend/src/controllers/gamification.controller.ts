import { Request, Response } from 'express';
import { getGamificationProgress, getGamificationSnapshot, getCategoryProgress, getDifficultyProgress, listGamificationAchievements } from '../services/gamification.service';

export async function getMyGamification(req: Request, res: Response): Promise<void> {
  res.json({ gamification: await getGamificationSnapshot(req.user!.id) });
}

export async function getMyProgress(req: Request, res: Response): Promise<void> {
  res.json({ progress: await getGamificationProgress(req.user!.id) });
}

export async function getMyAchievements(req: Request, res: Response): Promise<void> {
  res.json({ achievements: await listGamificationAchievements(req.user!.id) });
}

export async function getMyCategoryProgress(req: Request, res: Response): Promise<void> {
  res.json({ categories: await getCategoryProgress(req.user!.id) });
}

export async function getMyDifficultyProgress(req: Request, res: Response): Promise<void> {
  res.json({ difficulties: await getDifficultyProgress(req.user!.id) });
}
