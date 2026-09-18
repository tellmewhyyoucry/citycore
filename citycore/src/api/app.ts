import { Body, Catch, Controller, ExceptionFilter, ArgumentsHost, Get, Headers, Injectable, Module, Post, Query, Req } from '@nestjs/common';
import { timingSafeEqual, createHash } from 'crypto';
import { ZodError, z } from 'zod';
import { connectDatabase } from '../infra/database';
import { GameService } from '../core/game';
import { AuthService } from '../core/auth';
import { GameError } from '../core/validation';
import { Limiter } from '../infra/limiter';
function secret(value: unknown, expected: string | undefined) {
  if (typeof value !== 'string' || !expected || expected.length < 32) throw new GameError('Доступ запрещён', 403);
  const a = Buffer.from(value), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new GameError('Доступ запрещён', 403);
}
@Injectable()
export class Services {
  db = connectDatabase(); game = new GameService(this.db); auth = new AuthService(this.db); limiter = new Limiter();
  async onModuleInit() { await this.db.raw('SELECT 1'); await this.limiter.init(); }
  async onModuleDestroy() { await this.limiter.close(); await this.db.destroy(); }
}
@Controller()
export class ApiController {
  constructor(private services: Services) {}
  @Get('health') async health() { await this.services.db.raw('SELECT 1'); return { ok: true, project: 'CityCore RP' }; }
  @Post('bridge/register') async register(@Headers('x-bridge-key') key: string, @Body() body: unknown) {
    secret(key, process.env.BRIDGE_KEY);
    const input = z.object({ credentials: z.unknown(), source: z.string().min(1).max(100) }).strict().parse(body);
    await this.authLimit(input.source); return this.services.auth.register(input.credentials);
  }
  @Post('bridge/login') async login(@Headers('x-bridge-key') key: string, @Body() body: unknown) {
    secret(key, process.env.BRIDGE_KEY);
    const input = z.object({ credentials: z.unknown(), source: z.string().min(1).max(100) }).strict().parse(body);
    await this.authLimit(input.source); return this.services.auth.login(input.credentials);
  }
  private async authLimit(source: string) {
    await this.services.limiter.hit(`auth:${createHash('sha256').update(source).digest('hex')}`, 8, 60000);
    await this.services.limiter.hit('auth:global', 100, 60000);
  }
  private async actor(key: string, token: string) {
    secret(key, process.env.BRIDGE_KEY);
    const actor = await this.services.auth.actor(token || '');
    await this.services.limiter.hit(`actor:${actor}`, 30, 10000); return actor;
  }
  @Post('bridge/state') async state(@Headers('x-bridge-key') key: string, @Headers('x-session') token: string) {
    return this.services.game.state(await this.actor(key, token));
  }
  @Post('bridge/action') async action(@Headers('x-bridge-key') key: string, @Headers('x-session') token: string, @Body() body: unknown) {
    const actor = await this.actor(key, token);
    const input = z.object({ action: z.unknown(), world: z.unknown() }).strict().parse(body);
    return this.services.game.execute(actor, input.action, input.world);
  }
  @Post('bridge/logout') async logout(@Headers('x-bridge-key') key: string, @Headers('x-session') token: string) {
    secret(key, process.env.BRIDGE_KEY); await this.services.auth.logout(token || ''); return { ok: true };
  }
  @Get('admin/overview') async overview(@Headers('x-admin-key') key: string) {
    secret(key, process.env.ADMIN_KEY);
    const db = this.services.db;
    return {
      characters: await db('characters').count({ count: '*' }).first(),
      supply: await db('characters').sum({ cash: 'cash', bank: 'bank' }).first(),
      orders: await db('orders').select('status').count({ count: '*' }).groupBy('status'),
      recent: await db('ledger').orderBy('id', 'desc').limit(30),
    };
  }
  @Get('admin/character') async character(@Headers('x-admin-key') key: string, @Query('id') id: string) {
    secret(key, process.env.ADMIN_KEY);
    const actor = z.coerce.number().int().positive().parse(id);
    return { state: await this.services.game.state(actor), items: await this.services.db('item_log').where({ character_id: actor }).orderBy('id', 'desc').limit(30) };
  }
}
@Catch()
export class ApiErrors implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const status = exception instanceof GameError ? exception.status : exception instanceof ZodError ? 400 : exception?.getStatus?.() || 500;
    if (status >= 500) console.error('[api]', exception?.code || exception?.name || 'Error');
    host.switchToHttp().getResponse().status(status).json({ error: status >= 500 ? 'Сервис временно недоступен' : exception instanceof ZodError ? 'Проверьте поля запроса' : exception.message, status });
  }
}
@Module({ controllers: [ApiController], providers: [Services] })
export class AppModule {}
