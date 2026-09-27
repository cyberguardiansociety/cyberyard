import argon2 from 'argon2';

/**
 * Password hashing, centralized here so there's exactly one place that
 * decides the algorithm/parameters. Argon2id is used specifically (not
 * plain Argon2i/Argon2d) — it's the hybrid variant recommended by OWASP
 * for password storage, resistant to both side-channel and GPU-cracking
 * attacks. Argon2 also salts automatically per-hash, so no separate salt
 * column/handling is needed anywhere else in the codebase.
 *
 * Never log, return, or store the plaintext password anywhere else in the
 * app — it should only ever pass through these two functions.
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  return argon2.hash(plainPassword, {
    type: argon2.argon2id,
    // Explicit parameters instead of library defaults. They MUST stay
    // identical to the decoy hash used for timing equalization in
    // auth.service (m=65536 KiB, t=3, p=4): if the real and decoy
    // hashes cost different amounts of work, the timing difference
    // re-opens the user-enumeration side channel the decoy exists to
    // close. 64 MiB / 3 passes / 4 lanes is comfortably above the
    // OWASP argon2id minimum while staying fast enough for a login on
    // modest local hardware.
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPassword(hash: string, plainPassword: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plainPassword);
  } catch {
    // argon2.verify throws on a malformed/foreign hash format rather than
    // returning false — treat that the same as "doesn't match" instead of
    // letting it bubble up as a 500.
    return false;
  }
}
