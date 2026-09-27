import { z } from 'zod';

const usernameSchema = z.string().trim().min(3, 'Username must be at least 3 characters').max(32, 'Username must be at most 32 characters').regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores');
const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(320);
export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password is too long').regex(/[A-Za-z]/, 'Password must contain at least one letter').regex(/[0-9]/, 'Password must contain at least one number');

export const registerSchema = z.object({ username: usernameSchema, email: emailSchema, password: passwordSchema });
export type RegisterInput = z.infer<typeof registerSchema>;
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, 'Password is required'), rememberMe: z.boolean().optional().default(false) });
export type LoginInput = z.infer<typeof loginSchema>;
export const verifyEmailSchema = z.object({ token: z.string().min(40).max(256) });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema });
export const sessionIdSchema = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/i) });
