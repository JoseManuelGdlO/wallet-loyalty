import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import { Observable, tap } from "rxjs";

const SECRET_KEYS = new Set(["password", "adminPassword", "token", "scanToken", "authorization", "pushToken"]);

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("http");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const started = Date.now();
    return next.handle().pipe(
      tap({
        next: () => this.write(request, started, context.switchToHttp().getResponse().statusCode),
        error: (error) => this.write(request, started, error?.status || 500),
      }),
    );
  }

  private write(request: { method: string; originalUrl: string; body?: unknown }, started: number, status: number) {
    this.logger.log(
      JSON.stringify({
        method: request.method,
        path: request.originalUrl,
        status,
        ms: Date.now() - started,
        body: redact(request.body),
      }),
    );
  }
}

function redact(value: unknown): unknown {
  if (!value || typeof value !== "object") return undefined;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SECRET_KEYS.has(key) ? "[redacted]" : entry;
  }
  return output;
}
