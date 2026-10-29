import "reflect-metadata";
import "dotenv/config";
import { Catch, HttpException, Logger, Module, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { CqrsModule } from "@nestjs/cqrs";
import { ScheduleModule } from "@nestjs/schedule";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ZodError } from "zod";
import helmet from "helmet";
import { Database } from "./infrastructure/database";
import { AuthGuard } from "./infrastructure/auth";
import { Storage } from "./infrastructure/storage";
import { Integrations } from "./infrastructure/integrations";
import { PgMinutesRepository } from "./infrastructure/minutes.repository";
import { MinutesRepository } from "./application/repository";
import { ListMinutesHandler, SaveMinuteHandler } from "./application/handlers";
import { DeliveryService } from "./application/delivery";
import { ApiController } from "./presentation/controller";

@Catch()
class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("API");
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    if (error instanceof ZodError) { response.status(400).json({ statusCode: 400, message: "Dados inválidos", errors: error.issues.map(issue => ({ field: issue.path.join("."), message: issue.message })) }); return; }
    if (error instanceof HttpException) { response.status(error.getStatus()).json(error.getResponse()); return; }
    this.logger.error(error instanceof Error ? error.message : "Unexpected error");
    response.status(500).json({ statusCode: 500, message: "Erro interno. Contate o administrador." });
  }
}
@Module({
  imports: [CqrsModule.forRoot(), ScheduleModule.forRoot(), ThrottlerModule.forRoot([{ ttl: 60000, limit: 180 }])],
  controllers: [ApiController],
  providers: [Database, Storage, Integrations, DeliveryService, SaveMinuteHandler, ListMinutesHandler, { provide: MinutesRepository, useClass: PgMinutesRepository }, { provide: APP_GUARD, useClass: ThrottlerGuard }, { provide: APP_GUARD, useClass: AuthGuard }]
})
class AppModule {}

async function bootstrap() {
  if (process.env.NODE_ENV === "production" && process.env.AUTH_MODE === "demo") throw new Error("AUTH_MODE=demo não é permitido em produção");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL obrigatória");
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.use(helmet());
  app.enableCors({ origin: process.env.WEB_URL ?? "http://localhost:3000", methods: ["GET", "POST", "PATCH", "DELETE"], allowedHeaders: ["Authorization", "Content-Type", "If-Match", "Idempotency-Key"], exposedHeaders: ["ETag"] });
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  if (process.env.NODE_ENV !== "production") {
    const config = new DocumentBuilder().setTitle("Wind Planner API").setDescription("Atas de programação semanal · contrato detalhado em docs/API.md").setVersion("1.0").addBearerAuth().build();
    SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, config));
  }
  await app.listen(Number(process.env.PORT ?? 4000), "0.0.0.0");
  if (process.env.AUTH_MODE === "demo") Logger.warn("Autenticação DEMO ativa. Não exponha esta API publicamente.");
}
bootstrap().catch(error => { console.error(error); process.exitCode = 1; });