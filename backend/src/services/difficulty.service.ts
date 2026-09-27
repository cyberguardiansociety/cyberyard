import { prisma } from '../utils/prisma';

export interface PublicDifficulty {
  id: number;
  name: string;
  sortOrder: number;
}

/** GET /api/difficulties — full list, in intended display order. */
export async function listDifficulties(): Promise<PublicDifficulty[]> {
  const rows = await prisma.difficulty.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, sortOrder: true },
  });
  return rows;
}
