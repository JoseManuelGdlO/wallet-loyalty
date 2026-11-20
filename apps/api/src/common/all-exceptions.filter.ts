import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "No se pudo completar la operación";
    let code = "INTERNAL";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "string") {
        message = body;
        code = exception.name;
      } else if (body && typeof body === "object") {
        const record = body as { message?: string | string[]; code?: string };
        code = record.code || exception.name;
        message = Array.isArray(record.message) ? record.message.join(" ") : record.message || message;
      }
    } else {
      this.logger.error(
        JSON.stringify({
          path: request.originalUrl,
          error: exception instanceof Error ? exception.message : "error",
        }),
      );
    }

    response.status(status).json({
      statusCode: status,
      code,
      message,
      path: request.originalUrl,
    });
  }
}
