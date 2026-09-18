import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireRider } from '../lib/riderAuth.js';
import { HttpError } from '../lib/httpError.js';
import { createAuthService, limitAuthIp } from './service.js';
import {
  contactInput,
  loginSchema,
  parse,
  resendSchema,
  resetSchema,
  verificationSchema,
} from './validation.js';

export function createAuthRoutes(options) {
  const router = Router();
  const service = createAuthService(options);

  router.use('/auth', async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      await limitAuthIp(req.ip);
      next();
    } catch (err) {
      next(err);
    }
  });

  for (const purpose of ['signup', 'signin', 'reset']) {
    const path = {
      signup: '/auth/signup',
      signin: '/auth/signin/otp',
      reset: '/auth/password/reset',
    }[purpose];
    router.post(`${path}/start`, async (req, res) => {
      const data = contactInput(req.body, purpose === 'signup');
      if (purpose === 'reset' && data.channel !== 'email')
        throw new HttpError(400, 'VALIDATION_FAILED', 'Password reset uses email');
      res.status(202).json(await service.start(data, purpose, req.ip));
    });

    router.post(
      `${path}/${purpose === 'reset' ? 'complete' : 'verify'}`,
      async (req, res) => {
        const data = parse(
          purpose === 'reset' ? resetSchema : verificationSchema,
          req.body,
        );
        res
          .status(purpose === 'signup' ? 201 : 200)
          .json(await service.verify(data, purpose, req.ip));
      },
    );
  }

  router.post('/auth/signin/password', async (req, res) => {
    res.json(await service.passwordLogin(parse(loginSchema, req.body), req.ip));
  });

  router.post('/auth/otp/resend', async (req, res) => {
    res
      .status(202)
      .json(await service.resend(parse(resendSchema, req.body).challengeId, req.ip));
  });

  router.post('/auth/logout', requireRider, async (req, res) => {
    await pool.query('UPDATE rider_sessions SET revoked_at = now() WHERE id = $1', [
      req.sessionId,
    ]);
    res.sendStatus(204);
  });

  return router;
}
