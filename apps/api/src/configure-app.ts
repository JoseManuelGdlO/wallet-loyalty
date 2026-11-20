import { INestApplication, ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import express from "express";
import fs from "fs";
import helmet from "helmet";
import path from "path";
import { getConfig } from "./config/configuration";

export function configureApp(app: INestApplication) {
  const config = getConfig();
  app.setGlobalPrefix("api");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.enableCors({ origin: config.webOrigins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const uploadRoot = path.resolve(process.cwd(), config.uploadDir);
  fs.mkdirSync(uploadRoot, { recursive: true });
  app.use("/api/uploads", express.static(uploadRoot, { index: false, fallthrough: false }));
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
}
