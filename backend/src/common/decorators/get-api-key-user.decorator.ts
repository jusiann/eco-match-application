import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// ApiKeyGuard tarafından request.apiKeyUser'a yazılan { userId, facilityId } bilgisini okur.
export const GetApiKeyUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.apiKeyUser;
  },
);
