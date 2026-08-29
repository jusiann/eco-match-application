import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

interface ErrorBody {
  error: string;
  message: string;
  details?: unknown;
}

const DEFAULT_ERROR_CODES: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMIT_EXCEEDED',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

// Single source of the error response shape documented in docs/04-api-sozlesmesi.md:
// { error: MACHINE_CODE, message: Turkish text, details?: ... }. Handlers may throw
// `new ForbiddenException({ error: 'FACILITY_NOT_VERIFIED', message: '...' })` for a
// specific code, or a plain string/Nest default and let this filter fill in the rest.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const body = this.buildBody(exception, status);

    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    httpAdapter.reply(ctx.getResponse(), body, status);
  }

  private buildBody(exception: unknown, status: number): ErrorBody {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();

      if (typeof response === 'string') {
        return { error: DEFAULT_ERROR_CODES[status] ?? 'ERROR', message: response };
      }

      const payload = response as Record<string, unknown>;

      // class-validator via the global ValidationPipe throws BadRequestException
      // with { message: string[], error: 'Bad Request', statusCode }.
      if (Array.isArray(payload.message)) {
        return {
          error: 'VALIDATION_ERROR',
          message: payload.message[0] as string,
          details: { fields: payload.message },
        };
      }

      return {
        error: (payload.error as string) ?? DEFAULT_ERROR_CODES[status] ?? 'ERROR',
        message: (payload.message as string) ?? exception.message,
        ...(payload.details ? { details: payload.details } : {}),
      };
    }

    return {
      error: 'INTERNAL_ERROR',
      message: 'Beklenmedik bir hata oluştu. Lütfen daha sonra tekrar deneyin.',
    };
  }
}
