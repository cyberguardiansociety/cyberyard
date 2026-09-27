/**
 * Prisma seed script.
 *
 * Two independent parts:
 *   1. Reference + sample data (categories, difficulties, a handful of
 *      challenges) — safe to run in any environment, runs automatically,
 *      idempotent (safe to re-run; skips anything that already exists).
 *   2. An optional admin account bootstrap — opt-in only, driven entirely
 *      by environment variables, never hardcoded (see below).
 *
 * Sample challenge flags are defined as plain strings ONLY inside this
 * script, for local seeding convenience. They are hashed with the same
 * HMAC-SHA256 utility the real submission flow uses (src/utils/flagHash.ts)
 * before being written to the database — the plaintext value is never
 * stored in the database, returned by any API response, or logged by the
 * seed process.
 *
 * Usage:
 *   npm run prisma:seed
 *
 * Optional admin bootstrap:
 *   SEED_ADMIN_EMAIL=admin@example.com \
 *   SEED_ADMIN_USERNAME=admin \
 *   SEED_ADMIN_PASSWORD='a-real-password-you-choose' \
 *   npm run prisma:seed
 */
import { PrismaClient } from '@prisma/client';
import { TeamRole } from '../src/constants/enums';
import { hashFlag } from '../src/utils/flagHash';

// Keep this entry point directly type-checkable (`tsc --noEmit
// prisma/seed.ts`) even when invoked without the project's esModuleInterop
// setting. Runtime behavior still comes from the centralized password helper.
const { hashPassword } = require('../src/utils/password') as {
  hashPassword: (plainPassword: string) => Promise<string>;
};

const prisma = new PrismaClient();

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 140) || 'challenge';
}

async function uniqueChallengeSlug(title: string): Promise<string> {
  const base = slugify(title);
  let candidate = base;
  let suffix = 2;
  while (await prisma.challenge.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base.slice(0, Math.max(1, 155 - String(suffix).length))}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

const CATEGORIES: Array<{ name: string; slug: string }> = [
  { name: 'Web Exploitation', slug: 'web-exploitation' },
  { name: 'Cryptography', slug: 'cryptography' },
  { name: 'Forensics', slug: 'forensics' },
  { name: 'Binary Exploitation', slug: 'binary-exploitation' },
];

const DIFFICULTIES: Array<{ name: string; sortOrder: number }> = [
  { name: 'Easy', sortOrder: 1 },
  { name: 'Medium', sortOrder: 2 },
  { name: 'Hard', sortOrder: 3 },
  { name: 'Insane', sortOrder: 4 },
];

/**
 * A handful of sample challenges, not the frontend's full 15 — this is
 * seed data to exercise the API end-to-end (list/filter/detail/submit),
 * not a content migration. `flag` here is plaintext ONLY within this
 * script; see the file header.
 */
const CHALLENGES: Array<{
  title: string;
  category: string;
  difficulty: string;
  points: number;
  teaser: string;
  description: string;
  flag: string;
}> = [
  {
    title: 'Baby SQLi',
    category: 'Web Exploitation',
    difficulty: 'Easy',
    points: 150,
    teaser: 'A login form that trusts user input a little too much.',
    description:
      'This challenge presents a simple login form. Something about how it builds its query feels... trusting. Find a way to log in as admin without knowing the password.',
    flag: 'CYBH{sql1_1nj3ct10n_101}',
  },
  {
    title: 'Weak Cipher',
    category: 'Cryptography',
    difficulty: 'Easy',
    points: 220,
    teaser: 'An old cipher guarding a not-so-old secret.',
    description: 'A message has been encrypted with a classic substitution-style cipher. Recover the plaintext.',
    flag: 'CYBH{c4354r_w4s_h3r3}',
  },
  {
    title: 'Hidden in Plain Sight',
    category: 'Forensics',
    difficulty: 'Easy',
    points: 90,
    teaser: "Sometimes the flag is exactly where you'd expect.",
    description:
      'A seemingly ordinary image file has more inside it than meets the eye. Dig through its metadata and embedded data.',
    flag: 'CYBH{m3t4d4t4_n3v3r_l13s}',
  },
  {
    title: 'Stack Smash 101',
    category: 'Binary Exploitation',
    difficulty: 'Easy',
    points: 130,
    teaser: 'A classic buffer with no bounds checking in sight.',
    description:
      'This binary reads user input into a fixed-size buffer without checking its length. Overflow it to redirect execution.',
    flag: 'CYBH{buff3r_0v3rfl0w3d}',
  },
  {
    title: 'Broken Auth',
    category: 'Web Exploitation',
    difficulty: 'Medium',
    points: 250,
    teaser: 'Password reset flows are trickier than they look.',
    description:
      'A password reset feature ships with this app, but the token it emails out might not be as unguessable as intended.',
    flag: 'CYBH{r3s3t_t0k3n_guess3d}',
  },
];

async function seedCategoriesAndDifficulties(): Promise<void> {
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: {},
      create: category,
    });
  }
  for (const difficulty of DIFFICULTIES) {
    await prisma.difficulty.upsert({
      where: { name: difficulty.name },
      update: { sortOrder: difficulty.sortOrder },
      create: difficulty,
    });
  }
  console.log(`Seeded ${CATEGORIES.length} categories and ${DIFFICULTIES.length} difficulties.`);
}

async function seedChallenges(): Promise<void> {
  let created = 0;

  for (const c of CHALLENGES) {
    const existing = await prisma.challenge.findFirst({ where: { title: c.title } });
    if (existing) continue;

    const category = await prisma.category.findUniqueOrThrow({ where: { name: c.category } });
    const difficulty = await prisma.difficulty.findUniqueOrThrow({ where: { name: c.difficulty } });

    await prisma.challenge.create({
      data: {
        title: c.title,
        slug: await uniqueChallengeSlug(c.title),
        categoryId: category.id,
        difficultyId: difficulty.id,
        points: c.points,
        teaser: c.teaser,
        description: c.description,
        status: 'PUBLISHED',
        isPublished: true,
        publishedAt: new Date(),
        flag: {
          create: {
            flagHash: hashFlag(c.flag, true),
            caseSensitive: true,
          },
        },
      },
    });

    created += 1;
  }

  if (created === 0) {
    console.log('Challenge seed skipped — sample challenges already exist.');
    return;
  }

  console.log(`Created ${created} sample challenges. Flags were hashed without logging plaintext values.`);
}

async function seedBadges(): Promise<void> {
  const web = await prisma.category.findUnique({ where: { slug: 'web-exploitation' }, select: { id: true } });
  const hard = await prisma.difficulty.findUnique({ where: { name: 'Hard' }, select: { id: true } });
  const badges = [
    { slug: 'first-blood', name: 'First Blood', description: 'Claim First Blood on a challenge.', icon: 'star', criteria: JSON.stringify({ type: 'first_blood_count', count: 1 }) },
    { slug: 'five-solves', name: 'Five Solves', description: 'Solve five challenges.', icon: 'check', criteria: JSON.stringify({ type: 'solved_count', count: 5 }) },
    { slug: 'thousand-points', name: '1K Club', description: 'Earn 1,000 points from solves.', icon: 'bolt', criteria: JSON.stringify({ type: 'total_points', points: 1000 }) },
    { slug: 'five-day-streak', name: 'Five-Day Streak', description: 'Maintain a five-day solve streak.', icon: 'flame', criteria: JSON.stringify({ type: 'streak', days: 5 }) },
    { slug: 'level-five', name: 'Level Five', description: 'Reach level 5.', icon: 'level', criteria: JSON.stringify({ type: 'level', level: 5 }) },
    { slug: 'web-specialist', name: 'Web Specialist', description: 'Solve five published Web Exploitation challenges.', icon: 'code', criteria: JSON.stringify({ type: 'category_solved', categoryId: web?.id ?? 0, count: 5 }) },
    { slug: 'hard-hitter', name: 'Hard Hitter', description: 'Solve three Hard challenges.', icon: 'bolt', criteria: JSON.stringify({ type: 'difficulty_solved', difficultyId: hard?.id ?? 0, count: 3 }) },
    { slug: 'seven-day-streak', name: 'Seven-Day Streak', description: 'Maintain a seven-day solve streak.', icon: 'flame', criteria: JSON.stringify({ type: 'streak', days: 7 }) },
  ];
  for (const badge of badges) {
    await prisma.badge.upsert({ where: { slug: badge.slug }, update: badge, create: badge });
  }
  console.log(`Seeded ${badges.length} achievement badges.`);
}

/**
 * Demo wiring for the CTF engine additions: one challenge on dynamic
 * scoring and one with a prerequisite. Runs after seedChallenges() and is
 * idempotent — it only flips rows that are still in their default state,
 * so re-running (or a database whose challenges predate these columns)
 * behaves the same way.
 *
 * Seed ordering guarantees "Baby SQLi" (first entry) exists before
 * "Broken Auth" (last entry), so the prerequisite target is safe to
 * reference here.
 */
async function seedScoringAndPrerequisites(): Promise<void> {
  const dynamicDemo = await prisma.challenge.findFirst({
    where: { title: 'Baby SQLi' },
    select: { id: true, scoringMode: true },
  });
  if (dynamicDemo && dynamicDemo.scoringMode !== 'DYNAMIC') {
    await prisma.challenge.update({ where: { id: dynamicDemo.id }, data: { scoringMode: 'DYNAMIC' } });
    console.log('Set “Baby SQLi” to DYNAMIC scoring.');
  }

  const babySqli = await prisma.challenge.findFirst({ where: { title: 'Baby SQLi' }, select: { id: true } });
  const brokenAuth = await prisma.challenge.findFirst({
    where: { title: 'Broken Auth' },
    select: { id: true, prerequisiteId: true },
  });
  if (babySqli && brokenAuth && !brokenAuth.prerequisiteId) {
    await prisma.challenge.update({ where: { id: brokenAuth.id }, data: { prerequisiteId: babySqli.id } });
    console.log('Set “Broken Auth” prerequisite to “Baby SQLi”.');
  }
}

/**
 * Fixed-invite demo teams, wired to whatever non-admin users already
 * exist. This seed script creates no users itself (registration or the
 * optional admin bootstrap do), so on a userless database this is a
 * logged no-op; memberships are only ever created for users not already
 * on a team, keeping re-runs idempotent.
 */
const DEMO_TEAMS: Array<{ name: string; slug: string; inviteCode: string }> = [
  { name: 'Packet Storm', slug: 'packet-storm', inviteCode: 'CYHPACKETSTORM' },
  { name: 'Null Pointers', slug: 'null-pointers', inviteCode: 'CYHNULLPTR01' },
  { name: 'Root Cause', slug: 'root-cause', inviteCode: 'CYHROOTCAUSE' },
];

async function seedDemoTeams(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { role: 'USER' },
    orderBy: { createdAt: 'asc' },
    take: 6,
    select: { id: true },
  });
  if (users.length === 0) {
    console.log('Skipping demo teams — no non-admin users exist yet.');
    return;
  }

  let cursor = 0;
  for (const team of DEMO_TEAMS) {
    const existing = await prisma.team.findUnique({ where: { slug: team.slug }, select: { id: true } });
    if (existing) continue;

    // Hand out up to two still-unteamed users per demo team.
    const candidates: Array<{ id: string }> = [];
    while (cursor < users.length && candidates.length < 2) {
      const user = users[cursor];
      cursor += 1;
      const membership = await prisma.teamMember.findUnique({ where: { userId: user.id }, select: { teamId: true } });
      if (!membership) candidates.push(user);
    }
    if (candidates.length === 0) break;

    const [captain, ...members] = candidates;
    await prisma.team.create({
      data: {
        name: team.name,
        slug: team.slug,
        inviteCode: team.inviteCode,
        captainId: captain.id,
        members: {
          create: [
            { userId: captain.id, role: TeamRole.CAPTAIN },
            ...members.map((member) => ({ userId: member.id, role: TeamRole.MEMBER })),
          ],
        },
      },
    });
    console.log(`Created demo team “${team.name}” (invite code ${team.inviteCode}) with ${candidates.length} member(s).`);
  }
}

async function seedAdmin(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const username = process.env.SEED_ADMIN_USERNAME;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !username || !password) {
    console.log(
      'Skipping admin seed — set SEED_ADMIN_EMAIL, SEED_ADMIN_USERNAME, and ' +
        'SEED_ADMIN_PASSWORD as environment variables to create one.'
    );
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    console.log(`Admin seed skipped — a user with email ${email} already exists.`);
    return;
  }

  const passwordHash = await hashPassword(password);

  const admin = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      username,
      passwordHash,
      role: 'ADMIN',
      profile: { create: {} },
      settings: { create: {} },
    },
  });

  console.log(`Created admin user: ${admin.username} <${admin.email}>`);
}

async function main(): Promise<void> {
  await seedCategoriesAndDifficulties();
  await seedChallenges();
  await seedBadges();
  await seedScoringAndPrerequisites();
  await seedDemoTeams();
  await seedAdmin();
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

