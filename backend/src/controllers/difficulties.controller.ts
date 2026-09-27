import { Request, Response } from 'express';
import { listDifficulties } from '../services/difficulty.service';

/** GET /api/difficulties */
export async function getDifficulties(_req: Request, res: Response): Promise<void> {
  const difficulties = await listDifficulties();
  res.status(200).json({ difficulties });
}
