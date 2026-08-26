import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

export interface SessionStore { findOrCreateUser(sessionHash: string): Promise<string> }
export interface AuthContext { userId: string }
export interface AuthProvider { authenticate(request: FastifyRequest, reply: FastifyReply): Promise<AuthContext> }
export interface AnonymousSessionOptions { secure?: boolean; cookieName?: string; maxAgeSeconds?: number }

export class AnonymousSessionAuth implements AuthProvider {
  private readonly options: Required<AnonymousSessionOptions>;

  constructor(private readonly store: SessionStore, options: AnonymousSessionOptions = {}) {
    this.options = {
      secure: options.secure ?? false,
      cookieName: options.cookieName ?? 'tb_session',
      maxAgeSeconds: options.maxAgeSeconds ?? 60 * 60 * 24 * 365,
    };
  }

  async authenticate(request: FastifyRequest, reply: FastifyReply): Promise<AuthContext> {
    let session = request.cookies[this.options.cookieName];
    if (!session || !/^[a-f0-9]{64}$/.test(session)) {
      session = randomBytes(32).toString('hex');
      reply.setCookie(this.options.cookieName, session, {
        httpOnly: true,
        secure: this.options.secure,
        sameSite: 'lax',
        path: '/',
        maxAge: this.options.maxAgeSeconds,
      });
    }
    const sessionHash = createHash('sha256').update(session).digest('hex');
    return { userId: await this.store.findOrCreateUser(sessionHash) };
  }
}
