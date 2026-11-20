import { Controller, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { HttpStatus } from "@nestjs/common";
import type { AuthUser } from "../common/access";
import { CurrentUser } from "../common/current-user.decorator";
import { Roles } from "../common/decorators";
import { DomainException } from "../common/domain.exception";
import { getConfig } from "../config/configuration";

@ApiTags("uploads")
@ApiBearerAuth()
@Roles("SUPER_ADMIN", "BUSINESS_ADMIN")
@Controller("uploads")
export class UploadsController {
  @Post()
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: { type: "object", properties: { file: { type: "string", format: "binary" } } } })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 2_000_000 } }))
  async upload(@CurrentUser() user: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new DomainException(HttpStatus.BAD_REQUEST, "FILE_REQUIRED", "Elige una imagen");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) {
      throw new DomainException(HttpStatus.BAD_REQUEST, "FILE_TYPE", "Usa una imagen PNG, JPG o WebP");
    }
    const folder = user.businessId || "shared";
    const config = getConfig();
    const directory = path.resolve(process.cwd(), config.uploadDir, folder);
    await fs.mkdir(directory, { recursive: true });
    const filename = `${randomUUID()}.png`;
    const image = await sharp(file.buffer).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
    await fs.writeFile(path.join(directory, filename), image);
    return { url: `${config.publicBaseUrl}/api/uploads/${folder}/${filename}` };
  }
}
