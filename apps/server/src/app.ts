// Builds the Fastify app: Zod validation, the shared error shape and every
// route module. It doesn't listen, so tests can call it with app.inject().
import Fastify, { type FastifyError } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type Database from "better-sqlite3";
import type { ApiError } from "@goldrush/shared";
import { healthRoutes } from "./routes/health.ts";

export interface AppOptions {
  // The caller opens the database and closes it after the app.
  db: Database.Database;
  logger: boolean;
}

// What every route module receives when it is registered.
export interface RouteOptions {
  db: Database.Database;
}

function errorBody(message: string): ApiError {
  return { message };
}

export function buildApp({ db, logger }: AppOptions) {
  const app = Fastify({ logger }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Every error response is `{ message }` (apiErrorSchema), so the web
  // client can always show it.
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send(errorBody(error.message));
    }
    const status = error.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      return reply.status(status).send(errorBody(error.message));
    }
    request.log.error(error);
    return reply.status(500).send(errorBody("Internal server error"));
  });
  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send(errorBody("Not found"));
  });

  const routeOptions: RouteOptions = { db };
  app.register(healthRoutes, routeOptions);

  return app;
}

export type App = ReturnType<typeof buildApp>;
