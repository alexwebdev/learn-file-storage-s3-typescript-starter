import { randomBytes } from 'crypto';
import * as path from 'node:path';
import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";

type Thumbnail = {
  data: ArrayBuffer;
  mediaType: string;
};

export async function handlerGetThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }

  const thumbnail = video.thumbnailURL;
  if (!thumbnail) {
    throw new NotFoundError("Thumbnail not found");
  }

  return new Response(thumbnail);
}

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  const data = await req.formData();
  const thumbnail = data.get("thumbnail");
  if (!thumbnail || !(thumbnail instanceof File)) {
    throw new BadRequestError("Invalid file");
  }

  const MAX_UPLOAD_SIZE = 10 << 20;
  if (thumbnail.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError(`Thumbnail size should be ${MAX_UPLOAD_SIZE}`);
  }

  const mediaType = thumbnail.type;
  const arrayBuffer = await thumbnail.arrayBuffer();
  // const base64 = Buffer.from(arrayBuffer).toString("base64");
  const metadata = getVideo(cfg.db, videoId);
  if (metadata?.userID !== userID) {
    throw new UserForbiddenError('Unauthorized');
  }

  if (!(mediaType === 'image/png' || mediaType === 'image/jpeg')) {
    throw new BadRequestError("Invalid media type");
  }

  const fileName = `${randomBytes(32).toString('base64url')}.${mediaType.split('/')[1]}`;
  const thumbnailUrl = path.join(cfg.assetsRoot, fileName);
  await Bun.write(thumbnailUrl, arrayBuffer);

  const updatedVideo = {
    ...metadata,
    thumbnailURL: `http://localhost:8091/${thumbnailUrl}`
  };
  updateVideo(cfg.db, updatedVideo);

  return respondWithJSON(200, updatedVideo);
}
