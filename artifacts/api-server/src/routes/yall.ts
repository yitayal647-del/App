import { randomUUID } from "node:crypto";
import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  ilike,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  CreateCommentBody,
  PublishVideoBody,
  RequestUploadUrlBody,
  UpdateMyProfileBody,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  comments,
  favorites,
  follows,
  likes,
  notifications,
  uploads,
  users,
  videoShares,
  videos,
} from "@workspace/db/schema";
import { Router, type IRouter, type Request, type RequestHandler, type Response } from "express";
import { logger } from "../lib/logger";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { safeErrorDetails } from "./routeErrors";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 180;
const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
]);

class InvalidCursorError extends Error {}
class StorageUnavailableError extends Error {}

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

function handle(handler: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    void handler(req, res).catch((error: unknown) => {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Video file not found." });
        return;
      }
      if (error instanceof InvalidCursorError) {
        res.status(400).json({ error: "Invalid page cursor." });
        return;
      }
      if (error instanceof StorageUnavailableError) {
        res.status(503).json({ error: "Video storage is temporarily unavailable. Try again shortly." });
        return;
      }
      logger.error(
        { error: safeErrorDetails(error), method: req.method, path: req.path },
        "YOU ALL API request failed",
      );
      if (!res.headersSent) {
        res.status(500).json({ error: "The request could not be completed." });
      } else {
        next(error);
      }
    });
  };
}

function signedInUserId(req: Request): string | null {
  return getAuth(req).userId ?? null;
}

function requireUserId(req: Request, res: Response): string | null {
  const userId = signedInUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return null;
  }
  return userId;
}

function pathParam(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function queryString(req: Request, name: string): string | undefined {
  const value = req.query[name];
  return typeof value === "string" ? value : undefined;
}

function pageSize(req: Request, fallback: number, maximum: number): number {
  const raw = queryString(req, "limit");
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) ? Math.min(maximum, Math.max(1, value)) : fallback;
}

function decodeCursor(value: string | undefined): { createdAt: Date; id: string } | null {
  if (!value) return null;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const separator = decoded.indexOf("|");
    if (separator < 1) return null;
    const createdAt = new Date(decoded.slice(0, separator));
    const id = decoded.slice(separator + 1);
    return Number.isNaN(createdAt.getTime()) || !id ? null : { createdAt, id };
  } catch {
    return null;
  }
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

async function playbackUrlFor(videoId: string, objectPath: string) {
  try {
    return await storage.getObjectEntityReadURL(objectPath, 3600);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      logger.warn({ videoId }, "Published video references a missing storage object");
      return null;
    }
    logger.error(
      { videoId, storageError: safeErrorDetails(error) },
      "Could not create a video playback URL",
    );
    throw new StorageUnavailableError();
  }
}

export async function ensureProfile(userId: string) {
  const [existing] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (existing) return existing;

  const username = `creator_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  await db
    .insert(users)
    .values({
      id: userId,
      username,
      displayName: "New creator",
    })
    .onConflictDoNothing();

  const [created] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!created) throw new Error("Could not create the profile.");
  return created;
}

async function countFor(table: "followers" | "following" | "videos" | "likes", userId: string) {
  let result: Array<{ value: number }>;
  if (table === "followers") {
    result = await db
      .select({ value: count() })
      .from(follows)
      .where(eq(follows.followingId, userId));
  } else if (table === "following") {
    result = await db
      .select({ value: count() })
      .from(follows)
      .where(eq(follows.followerId, userId));
  } else if (table === "videos") {
    result = await db
      .select({ value: count() })
      .from(videos)
      .where(eq(videos.creatorId, userId));
  } else {
    result = await db
      .select({ value: count() })
      .from(likes)
      .innerJoin(videos, eq(likes.videoId, videos.id))
      .where(eq(videos.creatorId, userId));
  }
  return Number(result[0]?.value ?? 0);
}

async function serializeProfile(profile: typeof users.$inferSelect, viewerId: string | null) {
  const [followersCount, followingCount, videosCount, likesReceived, followRow] =
    await Promise.all([
      countFor("followers", profile.id),
      countFor("following", profile.id),
      countFor("videos", profile.id),
      countFor("likes", profile.id),
      viewerId && viewerId !== profile.id
        ? db
            .select({ id: follows.followerId })
            .from(follows)
            .where(and(eq(follows.followerId, viewerId), eq(follows.followingId, profile.id)))
            .limit(1)
        : Promise.resolve([]),
    ]);

  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    bio: profile.bio,
    followersCount,
    followingCount,
    videosCount,
    likesReceived,
    isFollowing: followRow.length > 0,
  };
}

export async function canViewVideo(
  video: { creatorId: string; visibility: string },
  viewerId: string | null,
) {
  if (video.visibility === "public" || video.creatorId === viewerId) return true;
  if (!viewerId || video.visibility !== "followers") return false;
  const [relationship] = await db
    .select({ followerId: follows.followerId })
    .from(follows)
    .where(and(eq(follows.followerId, viewerId), eq(follows.followingId, video.creatorId)))
    .limit(1);
  return Boolean(relationship);
}

export async function videoPage(options: {
  viewerId: string | null;
  limit: number;
  cursor: string | undefined;
  creatorId?: string;
  videoId?: string;
  mode?: "for-you" | "following";
  favoritesForUser?: string;
  captionSearch?: string;
}) {
  const cursor = decodeCursor(options.cursor);
  if (options.cursor && !cursor) {
    throw new InvalidCursorError();
  }

  const predicates = [];
  if (options.creatorId) predicates.push(eq(videos.creatorId, options.creatorId));
  if (options.videoId) predicates.push(eq(videos.id, options.videoId));
  if (options.captionSearch) {
    predicates.push(ilike(videos.caption, `%${options.captionSearch}%`));
  }
  if (options.favoritesForUser) {
    predicates.push(
      sql`exists(select 1 from ${favorites} where ${favorites.videoId} = ${videos.id} and ${favorites.userId} = ${options.favoritesForUser})`,
    );
  }
  if (options.mode === "following") {
    if (!options.viewerId) return { items: [], nextCursor: null };
    const following = await db
      .select({ id: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, options.viewerId));
    const followingIds = following.map((item) => item.id);
    if (!followingIds.length) return { items: [], nextCursor: null };
    predicates.push(inArray(videos.creatorId, followingIds));
    predicates.push(inArray(videos.visibility, ["public", "followers"]));
  } else if (options.creatorId || options.favoritesForUser || options.videoId) {
    const followRows = options.viewerId
      ? await db
          .select({ id: follows.followingId })
          .from(follows)
          .where(eq(follows.followerId, options.viewerId))
      : [];
    const followedIds = followRows.map((item) => item.id);
    const canSeeFollowingOnly = options.viewerId
      ? [...new Set([options.viewerId, ...followedIds])]
      : [];
    const visibilityConditions = [eq(videos.visibility, "public")];
    if (options.viewerId) {
      visibilityConditions.push(
        and(eq(videos.visibility, "private"), eq(videos.creatorId, options.viewerId))!,
      );
    }
    if (canSeeFollowingOnly.length) {
      visibilityConditions.push(
        and(
          eq(videos.visibility, "followers"),
          inArray(videos.creatorId, canSeeFollowingOnly),
        )!,
      );
    }
    predicates.push(or(...visibilityConditions)!);
  } else {
    predicates.push(eq(videos.visibility, "public"));
  }
  if (options.captionSearch) predicates.push(eq(videos.visibility, "public"));
  if (cursor) {
    predicates.push(
      or(
        lt(videos.createdAt, cursor.createdAt),
        and(eq(videos.createdAt, cursor.createdAt), lt(videos.id, cursor.id)),
      )!,
    );
  }

  const rows = await db
    .select({
      id: videos.id,
      creatorId: videos.creatorId,
      objectPath: videos.objectPath,
      caption: videos.caption,
      audioTitle: videos.audioTitle,
      durationSec: videos.durationSec,
      visibility: videos.visibility,
      createdAt: videos.createdAt,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      likesCount: sql<number>`cast((select count(*) from ${likes} where ${likes.videoId} = ${videos.id}) as integer)`,
      commentsCount: sql<number>`cast((select count(*) from ${comments} where ${comments.videoId} = ${videos.id}) as integer)`,
      favoritesCount: sql<number>`cast((select count(*) from ${favorites} where ${favorites.videoId} = ${videos.id}) as integer)`,
      sharesCount: sql<number>`cast((select count(*) from ${videoShares} where ${videoShares.videoId} = ${videos.id}) as integer)`,
      isLikedByMe: options.viewerId
        ? sql<boolean>`exists(select 1 from ${likes} where ${likes.videoId} = ${videos.id} and ${likes.userId} = ${options.viewerId})`
        : sql<boolean>`false`,
      isFavoritedByMe: options.viewerId
        ? sql<boolean>`exists(select 1 from ${favorites} where ${favorites.videoId} = ${videos.id} and ${favorites.userId} = ${options.viewerId})`
        : sql<boolean>`false`,
      isFollowing: options.viewerId
        ? sql<boolean>`exists(select 1 from ${follows} where ${follows.followerId} = ${options.viewerId} and ${follows.followingId} = ${videos.creatorId})`
        : sql<boolean>`false`,
    })
    .from(videos)
    .innerJoin(users, eq(videos.creatorId, users.id))
    .where(predicates.length > 0 ? and(...predicates) : undefined)
    .orderBy(desc(videos.createdAt), desc(videos.id))
    .limit(options.limit + 1);

  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;
  const resolved = await Promise.all(
    page.map(async (video) => {
      const playbackUrl = await playbackUrlFor(video.id, video.objectPath);
      if (!playbackUrl) return null;
      return {
        id: video.id,
        creator: {
          id: video.creatorId,
          username: video.username,
          displayName: video.displayName,
          avatarUrl: video.avatarUrl,
          isFollowing: Boolean(video.isFollowing),
        },
        caption: video.caption,
        audioTitle: video.audioTitle,
        playbackUrl,
        durationSec: Number(video.durationSec),
        visibility: video.visibility,
        likesCount: Number(video.likesCount),
        commentsCount: Number(video.commentsCount),
        favoritesCount: Number(video.favoritesCount),
        sharesCount: Number(video.sharesCount),
        isLikedByMe: Boolean(video.isLikedByMe),
        isFavoritedByMe: Boolean(video.isFavoritedByMe),
        createdAt: video.createdAt.toISOString(),
      };
    }),
  );
  const items = resolved.filter((item) => item !== null);

  const last = page.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}

router.get(
  "/profiles/me",
  handle(async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const profile = await ensureProfile(userId);
    res.json(await serializeProfile(profile, userId));
  }),
);

router.patch(
  "/profiles/me",
  handle(async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const parsed = UpdateMyProfileBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Check the profile fields and try again." });
      return;
    }
    if (
      (parsed.data.displayName !== undefined && !parsed.data.displayName.trim()) ||
      (parsed.data.username !== undefined &&
        !/^[a-zA-Z0-9_]{3,24}$/.test(parsed.data.username.trim().replace(/^@/, "")))
    ) {
      res.status(400).json({ error: "Enter a display name and a valid username." });
      return;
    }
    await ensureProfile(userId);
    try {
      const [updated] = await db
        .update(users)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();
      res.json(await serializeProfile(updated, userId));
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        res.status(409).json({ error: "That username is already taken." });
        return;
      }
      throw error;
    }
  }),
);

router.get(
  "/profiles/:username",
  handle(async (req, res) => {
    const [profile] = await db
      .select()
      .from(users)
      .where(eq(users.username, pathParam(req, "username")))
      .limit(1);
    if (!profile) {
      res.status(404).json({ error: "Creator not found." });
      return;
    }
    res.json(await serializeProfile(profile, signedInUserId(req)));
  }),
);

router.get(
  "/profiles/:username/videos",
  handle(async (req, res) => {
    const [profile] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, pathParam(req, "username")))
      .limit(1);
    if (!profile) {
      res.status(404).json({ error: "Creator not found." });
      return;
    }
    res.json(
      await videoPage({
        viewerId: signedInUserId(req),
        creatorId: profile.id,
        limit: pageSize(req, 12, 20),
        cursor: queryString(req, "cursor"),
      }),
    );
  }),
);

router.get(
  "/feed",
  handle(async (req, res) => {
    const mode = queryString(req, "mode") ?? "for-you";
    if (mode !== "for-you" && mode !== "following") {
      res.status(400).json({ error: "Choose a valid feed." });
      return;
    }
    const viewerId = signedInUserId(req);
    if (mode === "following" && !viewerId) {
      res.status(401).json({ error: "Sign in to see your following feed." });
      return;
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.json(
      await videoPage({
        viewerId,
        limit: pageSize(req, 12, 20),
        cursor: queryString(req, "cursor"),
        mode,
      }),
    );
  }),
);

router.get(
  "/videos/:videoId",
  handle(async (req, res) => {
    const page = await videoPage({
      viewerId: signedInUserId(req),
      videoId: pathParam(req, "videoId"),
      limit: 1,
      cursor: undefined,
      creatorId: undefined,
      favoritesForUser: undefined,
    });
    const item = page.items[0];
    if (!item) {
      res.status(404).json({ error: "Video not found or not visible to you." });
      return;
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.json(item);
  }),
);

router.get(
  "/favorites",
  handle(async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    res.setHeader("Cache-Control", "private, no-store");
    res.json(
      await videoPage({
        viewerId: userId,
        favoritesForUser: userId,
        limit: pageSize(req, 12, 20),
        cursor: queryString(req, "cursor"),
      }),
    );
  }),
);

router.post(
  "/storage/uploads/request-url",
  handle(async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid video file details." });
      return;
    }
    const { size, contentType } = parsed.data;
    if (
      size > MAX_VIDEO_BYTES ||
      !ALLOWED_VIDEO_TYPES.has(contentType.toLowerCase())
    ) {
      res.status(400).json({
        error: "Choose an MP4 or MOV video under 100 MB.",
      });
      return;
    }

    await ensureProfile(userId);
    let uploadURL: string;
    let objectPath: string;
    try {
      uploadURL = await storage.getObjectEntityUploadURL();
      objectPath = storage.normalizeObjectEntityPath(uploadURL);
    } catch (error) {
      logger.error(
        { storageError: safeErrorDetails(error), stage: "create-upload-url" },
        "Video upload storage is unavailable",
      );
      res.status(503).json({ error: "Video storage is not available right now. Try again shortly." });
      return;
    }
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await db.insert(uploads).values({
      id: randomUUID(),
      userId,
      objectPath,
      contentType: contentType.toLowerCase(),
      sizeBytes: size,
      expiresAt,
    });
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ uploadURL, objectPath, metadata: parsed.data });
  }),
);

router.post(
  "/videos/publish",
  handle(async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const parsed = PublishVideoBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Check the video details and try again." });
      return;
    }
    const input = parsed.data;
    if (
      input.sizeBytes > MAX_VIDEO_BYTES ||
      input.durationSec > MAX_VIDEO_SECONDS ||
      !ALLOWED_VIDEO_TYPES.has(input.contentType.toLowerCase())
    ) {
      res.status(400).json({
        error: "Video must be an MP4 or MOV, under 100 MB and no longer than three minutes.",
      });
      return;
    }

    const [upload] = await db
      .select()
      .from(uploads)
      .where(
        and(
          eq(uploads.userId, userId),
          eq(uploads.objectPath, input.objectPath),
        ),
      )
      .limit(1);
    if (!upload) {
      res.status(404).json({ error: "This upload is not available for your account." });
      return;
    }
    if (upload.publishedAt) {
      const [existingVideo] = await db
        .select({ id: videos.id })
        .from(videos)
        .where(eq(videos.objectPath, upload.objectPath))
        .limit(1);
      const existingPage = existingVideo
        ? await videoPage({
            viewerId: userId,
            videoId: existingVideo.id,
            limit: 1,
            cursor: undefined,
          })
        : { items: [] };
      const published = existingPage.items[0];
      if (published) {
        res.setHeader("Cache-Control", "private, no-store");
        res.status(200).json(published);
      } else {
        res.status(409).json({ error: "This upload was already published, but its video is no longer available." });
      }
      return;
    }
    if (upload.expiresAt <= new Date()) {
      res.status(400).json({ error: "This upload has expired. Choose the video again to retry." });
      return;
    }
    if (
      upload.sizeBytes !== input.sizeBytes ||
      upload.contentType !== input.contentType.toLowerCase()
    ) {
      res.status(400).json({ error: "Uploaded file details do not match the request." });
      return;
    }

    let actualSize: number;
    let actualType: string;
    let header: Buffer;
    try {
      const file = await storage.getObjectEntityFile(upload.objectPath);
      const [metadata] = await file.getMetadata();
      actualSize = Number(metadata.size);
      actualType = String(metadata.contentType ?? "").toLowerCase();
      [header] = await file.download({ start: 0, end: 11 });
    } catch (error) {
      if (error instanceof ObjectNotFoundError || safeErrorDetails(error).code === 404) {
        res.status(400).json({ error: "The uploaded video is missing or the upload has not finished." });
        return;
      }
      logger.error(
        { storageError: safeErrorDetails(error), stage: "verify-upload" },
        "Could not verify the uploaded video",
      );
      res.status(503).json({ error: "Video storage could not verify the upload. Try again shortly." });
      return;
    }
    if (
      actualSize !== upload.sizeBytes ||
      actualSize > MAX_VIDEO_BYTES ||
      actualType !== upload.contentType
    ) {
      res.status(400).json({ error: "The uploaded video could not be verified." });
      return;
    }
    if (header.length < 8 || header.toString("ascii", 4, 8) !== "ftyp") {
      res.status(400).json({ error: "The uploaded file is not a supported MP4 or MOV video." });
      return;
    }
    const playbackUrl = await playbackUrlFor("new-upload", upload.objectPath);
    if (!playbackUrl) {
      res.status(400).json({ error: "The uploaded video is no longer available in storage." });
      return;
    }
    const user = await ensureProfile(userId);
    const videoId = randomUUID();
    const createdAt = new Date();
    const publishResult = await db.transaction(async (tx) => {
      const [lockedUpload] = await tx
        .select()
        .from(uploads)
        .where(eq(uploads.id, upload.id))
        .for("update")
        .limit(1);
      if (!lockedUpload || lockedUpload.userId !== userId) {
        return { kind: "missing" as const };
      }
      if (lockedUpload.publishedAt) {
        const [existing] = await tx
          .select({ id: videos.id })
          .from(videos)
          .where(eq(videos.objectPath, lockedUpload.objectPath))
          .limit(1);
        return existing
          ? { kind: "existing" as const, videoId: existing.id }
          : { kind: "missing" as const };
      }
      if (lockedUpload.expiresAt <= new Date()) {
        return { kind: "expired" as const };
      }

      const [inserted] = await tx
        .insert(videos)
        .values({
          id: videoId,
          creatorId: userId,
          objectPath: lockedUpload.objectPath,
          caption: input.caption.trim(),
          audioTitle: input.audioTitle?.trim() ?? "",
          durationSec: input.durationSec,
          sizeBytes: actualSize,
          contentType: actualType,
          visibility: input.visibility,
        })
        .onConflictDoNothing({ target: videos.objectPath })
        .returning({ id: videos.id });
      if (!inserted) {
        const [existing] = await tx
          .select({ id: videos.id })
          .from(videos)
          .where(eq(videos.objectPath, lockedUpload.objectPath))
          .limit(1);
        if (!existing) {
          throw new Error("Video insert conflicted without an existing video record.");
        }
        const publishedAt = new Date();
        await tx
          .update(uploads)
          .set({ publishedAt })
          .where(eq(uploads.id, lockedUpload.id));
        return { kind: "existing" as const, videoId: existing.id };
      }
      await tx
        .update(uploads)
        .set({ publishedAt: createdAt })
        .where(eq(uploads.id, lockedUpload.id));
      return { kind: "created" as const, videoId: inserted.id };
    });
    if (publishResult.kind === "missing") {
      res.status(409).json({ error: "This upload has already been published or is no longer available." });
      return;
    }
    if (publishResult.kind === "expired") {
      res.status(400).json({ error: "This upload has expired. Choose the video again to retry." });
      return;
    }
    if (publishResult.kind === "existing") {
      const existing = await videoPage({
        viewerId: userId,
        videoId: publishResult.videoId,
        limit: 1,
        cursor: undefined,
      });
      const published = existing.items[0];
      if (!published) {
        res.status(409).json({ error: "This upload was already published, but its video is no longer available." });
        return;
      }
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(published);
      return;
    }

    res.setHeader("Cache-Control", "private, no-store");
    res.status(201).json({
      id: publishResult.videoId,
      creator: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        isFollowing: false,
      },
      caption: input.caption.trim(),
      audioTitle: input.audioTitle?.trim() ?? "",
      playbackUrl,
      durationSec: input.durationSec,
      visibility: input.visibility,
      likesCount: 0,
      commentsCount: 0,
      favoritesCount: 0,
      sharesCount: 0,
      isLikedByMe: false,
      isFavoritedByMe: false,
      createdAt: createdAt.toISOString(),
    });
  }),
);

router.post(
  "/videos/:videoId/like",
  handle(async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    await ensureProfile(userId);
    const videoId = pathParam(req, "videoId");
    let isLiked = false;
    let creatorId: string | null = null;

    await db.transaction(async (tx) => {
      const [video] = await tx
        .select({ id: videos.id, creatorId: videos.creatorId, visibility: videos.visibility })
        .from(videos)
        .where(eq(videos.id, videoId))
        .for("update")
        .limit(1);
      if (!video) return;
      if (!(await canViewVideo(video, userId))) return;
      creatorId = video.creatorId;
      const [existing] = await tx
        .select({ userId: likes.userId })
        .from(likes)
        .where(and(eq(likes.userId, userId), eq(likes.videoId, videoId)))
        .limit(1);
      if (existing) {
        await tx
          .delete(likes)
          .where(and(eq(likes.userId, userId), eq(likes.videoId, videoId)));
      } else {
        await tx.insert(likes).values({ userId, videoId }).onConflictDoNothing();
        isLiked = true;
        if (creatorId !== userId) {
          await tx.insert(notifications).values({
            id: randomUUID(),
            recipientId: creatorId,
            actorId: userId,
            type: "like",
            videoId,
          });
        }
      }
    });
    if (!creatorId) {
      res.status(404).json({ error: "Video not found." });
      return;
    }
    const [likesRow] = await db
      .select({ value: count() })
      .from(likes)
      .where(eq(likes.videoId, videoId));
    res.json({ isLiked, likesCount: Number(likesRow?.value ?? 0) });
  }),
);

router.get(
  "/videos/:videoId/comments",
  handle(async (req, res) => {
    const videoId = pathParam(req, "videoId");
    const [video] = await db
      .select({ id: videos.id, creatorId: videos.creatorId, visibility: videos.visibility })
      .from(videos)
      .where(eq(videos.id, videoId))
      .limit(1);
    if (!video || !(await canViewVideo(video, signedInUserId(req)))) {
      res.status(404).json({ error: "Video not found or not visible to you." });
      return;
    }
    const limit = pageSize(req, 30, 50);
    const cursorValue = queryString(req, "cursor");
    const cursor = decodeCursor(cursorValue);
    if (cursorValue && !cursor) {
      res.status(400).json({ error: "Invalid page cursor." });
      return;
    }
    const predicates = [eq(comments.videoId, videoId)];
    if (cursor) {
      predicates.push(
        or(
          lt(comments.createdAt, cursor.createdAt),
          and(eq(comments.createdAt, cursor.createdAt), lt(comments.id, cursor.id)),
        )!,
      );
    }
    const rows = await db
      .select({
        id: comments.id,
        body: comments.body,
        createdAt: comments.createdAt,
        authorId: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(comments)
      .innerJoin(users, eq(comments.authorId, users.id))
      .where(and(...predicates))
      .orderBy(desc(comments.createdAt), desc(comments.id))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((comment) => ({
      id: comment.id,
      author: {
        id: comment.authorId,
        username: comment.username,
        displayName: comment.displayName,
        avatarUrl: comment.avatarUrl,
      },
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
    }));
    const last = rows[Math.min(limit, rows.length) - 1];
    res.json({
      items,
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    });
  }),
);

router.post(
  "/videos/:videoId/comments",
  handle(async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const parsed = CreateCommentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Write a comment under 1,000 characters." });
      return;
    }
    const body = parsed.data.body.trim();
    if (!body) {
      res.status(400).json({ error: "Write a comment before sending it." });
      return;
    }
    await ensureProfile(userId);
    const videoId = pathParam(req, "videoId");
    const [video] = await db
      .select({
        id: videos.id,
        creatorId: videos.creatorId,
        visibility: videos.visibility,
        allowComments: videos.allowComments,
      })
      .from(videos)
      .where(eq(videos.id, videoId))
      .limit(1);
    if (!video || !(await canViewVideo(video, userId))) {
      res.status(404).json({ error: "Video not found or not visible to you." });
      return;
    }
    if (!video.allowComments) {
      res.status(403).json({ error: "Comments are disabled for this video." });
      return;
    }
    const commentId = randomUUID();
    const createdAt = new Date();
    await db.transaction(async (tx) => {
      await tx.insert(comments).values({
        id: commentId,
        videoId,
        authorId: userId,
        body,
      });
      if (video.creatorId !== userId) {
        await tx.insert(notifications).values({
          id: randomUUID(),
          recipientId: video.creatorId,
          actorId: userId,
          type: "comment",
          videoId,
        });
      }
    });
    const author = await ensureProfile(userId);
    res.status(201).json({
      id: commentId,
      author: {
        id: author.id,
        username: author.username,
        displayName: author.displayName,
        avatarUrl: author.avatarUrl,
      },
      body,
      createdAt: createdAt.toISOString(),
    });
  }),
);

router.post(
  "/profiles/:profileId/follow",
  handle(async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    await ensureProfile(userId);
    const profileId = pathParam(req, "profileId");
    if (profileId === userId) {
      res.status(400).json({ error: "You cannot follow your own profile." });
      return;
    }
    let isFollowing = false;
    await db.transaction(async (tx) => {
      const [profile] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, profileId))
        .for("update")
        .limit(1);
      if (!profile) return;
      const [existing] = await tx
        .select({ followerId: follows.followerId })
        .from(follows)
        .where(and(eq(follows.followerId, userId), eq(follows.followingId, profileId)))
        .limit(1);
      if (existing) {
        await tx
          .delete(follows)
          .where(and(eq(follows.followerId, userId), eq(follows.followingId, profileId)));
      } else {
        await tx
          .insert(follows)
          .values({ followerId: userId, followingId: profileId })
          .onConflictDoNothing();
        isFollowing = true;
        await tx.insert(notifications).values({
          id: randomUUID(),
          recipientId: profileId,
          actorId: userId,
          type: "follow",
        });
      }
    });
    const [exists] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, profileId))
      .limit(1);
    if (!exists) {
      res.status(404).json({ error: "Creator not found." });
      return;
    }
    const [followersRow] = await db
      .select({ value: count() })
      .from(follows)
      .where(eq(follows.followingId, profileId));
    res.json({
      isFollowing,
      followersCount: Number(followersRow?.value ?? 0),
    });
  }),
);

router.get(
  "/search",
  handle(async (req, res) => {
    const query = queryString(req, "q")?.trim() ?? "";
    if (!query || query.length > 80) {
      res.json({ users: [], videos: [] });
      return;
    }
    const matchingUsers = await db
      .select()
      .from(users)
      .where(or(ilike(users.username, `%${query}%`), ilike(users.displayName, `%${query}%`)))
      .orderBy(users.username)
      .limit(10);
    const viewerId = signedInUserId(req);
    const [profiles, videoResults] = await Promise.all([
      Promise.all(matchingUsers.map((profile) => serializeProfile(profile, viewerId))),
      videoPage({
        viewerId,
        limit: 10,
        cursor: undefined,
        captionSearch: query,
      }),
    ]);
    res.json({ users: profiles, videos: videoResults.items });
  }),
);

router.get(
  "/notifications",
  handle(async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    await ensureProfile(userId);
    const rows = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        videoId: notifications.videoId,
        createdAt: notifications.createdAt,
        actorId: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(notifications)
      .innerJoin(users, eq(notifications.actorId, users.id))
      .where(eq(notifications.recipientId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    res.json({
      items: rows.map((item) => ({
        id: item.id,
        type: item.type,
        actor: {
          id: item.actorId,
          username: item.username,
          displayName: item.displayName,
          avatarUrl: item.avatarUrl,
        },
        videoId: item.videoId,
        createdAt: item.createdAt.toISOString(),
      })),
    });
  }),
);

export default router;
