import { z } from 'zod';
import { HttpError } from '../lib/httpError.js';

export const passwordSchema = z.string().min(12).max(128);
const contactFields = {
  channel: z.enum(['email', 'phone']),
  contact: z.string().trim().min(1).max(254),
};
const contactSchema = z.object(contactFields).strict();
const signupSchema = z.object({ ...contactFields, name: z.string().trim().min(1).max(100),
  password: passwordSchema.optional() }).strict();

export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(400, 'VALIDATION_FAILED', 'Invalid request fields',
    result.error.issues.map(({ path, message }) => ({ field: path.join('.'), message })));
  return result.data;
}

export function contactInput(input, signup = false) {
  const data = parse(signup ? signupSchema : contactSchema, input);
  if (data.channel === 'email') {
    data.contact = parse(z.string().email().max(254), data.contact.toLowerCase());
    if (signup && !data.password) throw new HttpError(400, 'VALIDATION_FAILED', 'Email signup requires a password');
  } else {
    data.contact = parse(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Use a phone number with country code, e.g. +919876543210'), data.contact);
    if (data.password !== undefined) throw new HttpError(400, 'VALIDATION_FAILED', 'Phone signup uses OTP, without a password');
  }
  return data;
}

export const verificationSchema = z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }).strict();
export const resetSchema = verificationSchema.extend({ password: passwordSchema });
export const resendSchema = z.object({ challengeId: z.string().uuid() }).strict();
export const loginSchema = z.object({ email: z.string().trim().email().max(254).transform((s) => s.toLowerCase()),
  password: z.string().min(1).max(128) }).strict();
