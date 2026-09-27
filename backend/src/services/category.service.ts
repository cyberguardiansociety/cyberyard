import { prisma } from '../utils/prisma';

export interface PublicCategory {
  id: number;
  name: string;
  slug: string;
}

/** GET /api/categories — full list, alphabetical by name. */
export async function listCategories(): Promise<PublicCategory[]> {
  return prisma.category.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true },
  });
}
