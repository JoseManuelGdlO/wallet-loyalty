import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthUser } from "./access";

export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext): AuthUser => {
  return context.switchToHttp().getRequest().user;
});
