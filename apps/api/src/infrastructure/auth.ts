import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Request } from "express";
import { z } from "zod";
import { roles, type Actor, type Role } from "../domain/minute";
import { Database } from "./database";

export type AuthRequest = Request & { actor: Actor };
export const RequireRoles = (...allowed: Role[]) => SetMetadata("roles", allowed);
export const Public = () => SetMetadata("public", true);

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly tenant = process.env.ENTRA_TENANT_ID;
  private readonly jwks = this.tenant && z.uuid().safeParse(this.tenant).success ? createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${this.tenant}/discovery/v2.0/keys`)) : null;
  constructor(@Inject(Reflector) private readonly reflector: Reflector, @Inject(Database) private readonly database: Database) {}
  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride("public", [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    let actor: Actor;
    if (process.env.AUTH_MODE === "demo" && process.env.NODE_ENV !== "production") {
      actor = { companyId: "00000000-0000-4000-8000-000000000001", id: "00000000-0000-4000-8000-000000000002", name: "Administrador Demo", role: "Administrador" };
    } else {
      if (!this.jwks || !process.env.ENTRA_AUDIENCE) throw new UnauthorizedException("Autenticação corporativa não configurada");
      const token = request.headers.authorization?.replace(/^Bearer /i, "");
      if (!token) throw new UnauthorizedException("Token obrigatório");
      try {
        const { payload } = await jwtVerify(token, this.jwks, { issuer: `https://login.microsoftonline.com/${this.tenant}/v2.0`, audience: process.env.ENTRA_AUDIENCE, algorithms: ["RS256"] });
        const companyId = z.uuid().parse(payload.tid);
        const id = z.uuid().parse(payload.oid);
        const granted = Array.isArray(payload.roles) ? payload.roles : [];
        const role = roles.find(candidate => granted.includes(candidate));
        if (!role) throw new Error("Perfil não autorizado");
        actor = { companyId, id, name: typeof payload.name === "string" ? payload.name.slice(0, 200) : id, role };
      } catch { throw new UnauthorizedException("Token inválido, expirado ou sem perfil autorizado"); }
    }
    const allowed = this.reflector.getAllAndOverride<Role[]>("roles", [context.getHandler(), context.getClass()]);
    if (allowed && !allowed.includes(actor.role)) throw new ForbiddenException("Seu perfil não permite esta operação");
    const company = await this.database.query("SELECT 1 FROM companies WHERE id=$1 AND active=true", [actor.companyId]);
    if (!company.rowCount) throw new ForbiddenException("Empresa não habilitada");
    await this.database.query("INSERT INTO users(company_id,id,name,role) VALUES($1,$2,$3,$4) ON CONFLICT(company_id,id) DO UPDATE SET name=EXCLUDED.name,role=EXCLUDED.role,last_seen_at=now()", [actor.companyId, actor.id, actor.name, actor.role]);
    request.actor = actor;
    return true;
  }
}