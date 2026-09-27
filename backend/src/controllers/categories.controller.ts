import { Request, Response } from 'express';
import { listCategories } from '../services/category.service';

/** GET /api/categories */
export async function getCategories(_req: Request, res: Response): Promise<void> {
  const categories = await listCategories();
  res.status(200).json({ categories });
}
