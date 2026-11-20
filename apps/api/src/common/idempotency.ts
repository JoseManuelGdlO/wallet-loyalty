import { HttpStatus } from "@nestjs/common";
import { DomainException } from "./domain.exception";

export function requireIdempotency(value?: string) {
  const key = value?.trim() || "";
  if (key.length < 8 || key.length > 120) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      "IDEMPOTENCY_KEY",
      "Envía el encabezado Idempotency-Key (entre 8 y 120 caracteres)",
    );
  }
  return key;
}
