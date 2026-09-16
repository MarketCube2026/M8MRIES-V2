import type { RequestHandler } from 'express';
import type { UserRole } from '@prisma/client';
export type Identity = { id: string; role: UserRole };
declare global { namespace Express { interface Request { identity: Identity } } }
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function requireRoles(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => roles.includes(req.identity.role) ? next() : next(new HttpError(403, '当前账号无权执行该操作'));
}
export function authentication(supabase: any, prisma: any): RequestHandler {
  return async (req, _res, next) => {
    try {
      const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if (!token) throw new HttpError(401, '请先登录');
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) throw new HttpError(401, '登录已过期，请重新登录');
      const access = await prisma.userAccess.findUnique({ where: { userId: data.user.id } });
      if (!access?.active) throw new HttpError(403, '账号尚未分配系统权限，请联系管理员');
      req.identity = { id: data.user.id, role: access.role };
      next();
    } catch (e) { next(e); }
  };
}
export function scope(identity: Identity) {
  return identity.role === 'APPLICANT' ? { ownerId: identity.id } : {};
}
