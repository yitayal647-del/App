import { randomUUID } from "node:crypto";
import {
  and,
  count,
  desc,
  eq,
  gt,
  ilike,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { ReportUserBody, ShareVideoBody } from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  blockedUsers,
  conversationParticipants,
  favorites,
  follows,
  messages,
  users,
  videoShares,
  videos,
  userReports,
} from "@workspace/db/schema";
import {
  Router,
  type IRouter,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { logger } from "../lib/logger";
import { ObjectStorageService } from "../lib/objectStorage";
import { canViewVideo, ensureProfile } from "./yall";

const router: IRouter = Router();
const storage = new ObjectStorageService();
type AsyncHandler = (req: Request, res: Response) => Promise<void>;

function handle(handler: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    void handler(req, res).catch((error: unknown) => {
      logger.error(
        { err: error, method: req.method, path: req.path },
        "YOU ALL social API request failed",
      );
      if (!res.headersSent) res.status(500).json({ error: "The request could not be completed." });
      else next(error);
    });
  };
}

function signedInUserId(req: Request) {
  return getAuth(req).userId ?? null;
}

function requireUserId(req: Request, res: Response) {
  const userId = signedInUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return null;
  }
  return userId;
}

function param(req: Request, name: string) {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function queryString(req: Request, name: string) {
  const value = req.query[name];
  return typeof value === "string" ? value : undefined;
}

function limitFrom(req: Request, fallback = 25, maximum = 50) {
  const raw = queryString(req, "limit");
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? Math.min(maximum, value) : fallback;
}

function decodeCursor(value: string | undefined) {
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

function encodeCursor(createdAt: Date, id: string) {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

function stableAppUrl() {
  const raw = process.env.EXPO_PUBLIC_APP_URL?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

router.get(
  "/profiles/:profileId/followers",
  handle(async (req, res) => {
    const profileId = param(req, "profileId");
    const [profile] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, profileId))
      .limit(1);
    if (!profile) {
      res.status(404).json({ error: "Creator not found." });
      return;
    }

    const limit = limitFrom(req);
    const cursorValue = queryString(req, "cursor");
    const cursor = decodeCursor(cursorValue);
    if (cursorValue && !cursor) {
      res.status(400).json({ error: "Invalid page cursor." });
      return;
    }
    const predicates = [eq(follows.followingId, profileId)];
    const search = queryString(req, "q")?.trim();
    if (search) {
      predicates.push(
        or(ilike(users.username, `%${search}%`), ilike(users.displayName, `%${search}%`))!,
      );
    }
    if (cursor) {
      predicates.push(
        or(
          lt(follows.createdAt, cursor.createdAt),
          and(eq(follows.createdAt, cursor.createdAt), lt(users.id, cursor.id)),
        )!,
      );
    }
    const viewerId = signedInUserId(req);
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        createdAt: follows.createdAt,
        isFollowing: viewerId
          ? sql<boolean>`exists(select 1 from ${follows} where ${follows.followerId} = ${viewerId} and ${follows.followingId} = ${users.id})`
          : sql<boolean>`false`,
      })
      .from(follows)
      .innerJoin(users, eq(follows.followerId, users.id))
      .where(and(...predicates))
      .orderBy(desc(follows.createdAt), desc(users.id))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);
    res.json({
      items: page.map(({ createdAt: _createdAt, ...user }) => ({
        ...user,
        isFollowing: Boolean(user.isFollowing),
      })),
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    });
  }),
);

router.get(
  "/profiles/:profileId/following",
  handle(async (req, res) => {
    const profileId = param(req, "profileId");
    const [profile] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, profileId))
      .limit(1);
    if (!profile) {
      res.status(404).json({ error: "Creator not found." });
      return;
    }

    const limit = limitFrom(req);
    const cursorValue = queryString(req, "cursor");
    const cursor = decodeCursor(cursorValue);
    if (cursorValue && !cursor) {
      res.status(400).json({ error: "Invalid page cursor." });
      return;
    }
    const predicates = [eq(follows.followerId, profileId)];
    const search = queryString(req, "q")?.trim();
    if (search) {
      predicates.push(
        or(ilike(users.username, `%${search}%`), ilike(users.displayName, `%${search}%`))!,
      );
    }
    if (cursor) {
      predicates.push(
        or(
          lt(follows.createdAt, cursor.createdAt),
          and(eq(follows.createdAt, cursor.createdAt), lt(users.id, cursor.id)),
        )!,
      );
    }
    const viewerId = signedInUserId(req);
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        createdAt: follows.createdAt,
        isFollowing: viewerId
          ? sql<boolean>`exists(select 1 from ${follows} where ${follows.followerId} = ${viewerId} and ${follows.followingId} = ${users.id})`
          : sql<boolean>`false`,
      })
      .from(follows)
      .innerJoin(users, eq(follows.followingId, users.id))
      .where(and(...predicates))
      .orderBy(desc(follows.createdAt), desc(users.id))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);
    res.json({
      items: page.map(({ createdAt: _createdAt, ...user }) => ({
        ...user,
        isFollowing: Boolean(user.isFollowing),
      })),
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    });
  }),
);

router.post(
  "/videos/:videoId/favorite",
  handle(async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const videoId = param(req, "videoId");
    const [video] = await db
      .select({ id: videos.id, creatorId: videos.creatorId, visibility: videos.visibility })
      .from(videos)
      .where(eq(videos.id, videoId))
      .limit(1);
    if (!video || !(await canViewVideo(video, userId))) {
      res.status(404).json({ error: "Video not found or not visible to you." });
      return;
    }
    await ensureProfile(userId);

    let isFavorited = false;
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ userId: favorites.userId })
        .from(favorites)
        .where(and(eq(favorites.userId, userId), eq(favorites.videoId, videoId)))
        .limit(1);
      if (existing) {
        await tx
          .delete(favorites)
          .where(and(eq(favorites.userId, userId), eq(favorites.videoId, videoId)));
      } else {
        await tx.insert(favorites).values({ userId, videoId }).onConflictDoNothing();
        isFavorited = true;
      }
    });
    const [favoriteCount] = await db
      .select({ value: count() })
      .from(favorites)
      .where(eq(favorites.videoId, videoId));
    res.json({ isFavorited, favoritesCount: Number(favoriteCount?.value ?? 0) });
  }),
);

router.post(
  "/videos/:videoId/share",
  handle(async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const parsed = ShareVideoBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Choose a valid sharing method." });
      return;
    }
    const shareBase = stableAppUrl();
    if (!shareBase) {
      res.status(503).json({ error: "Public video links are not configured." });
      return;
    }
    const videoId = param(req, "videoId");
    const [video] = await db
      .select({ id: videos.id, visibility: videos.visibility })
      .from(videos)
      .where(and(eq(videos.id, videoId), eq(videos.visibility, "public")))
      .limit(1);
    if (!video) {
      res.status(404).json({ error: "Only public videos can be shared." });
      return;
    }
    await ensureProfile(userId);
    const recentShares = await db
      .select({ value: count() })
      .from(videoShares)
      .where(
        and(
          eq(videoShares.userId, userId),
          gt(videoShares.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
        ),
      );
    if (Number(recentShares[0]?.value ?? 0) >= 30) {
      res.status(429).json({ error: "Share rate limit reached. Try again later." });
      return;
    }
    await db.insert(videoShares).values({
      id: randomUUID(),
      userId,
      videoId,
      method: parsed.data.method,
    });
    const [shareCount] = await db
      .select({ value: count() })
      .from(videoShares)
      .where(eq(videoShares.videoId, videoId));
    res.json({
      shareUrl: `${shareBase}/api/share/${encodeURIComponent(videoId)}`,
      sharesCount: Number(shareCount?.value ?? 0),
    });
  }),
);

router.get(
  "/share/:videoId",
  handle(async (req, res) => {
    const shareBase = stableAppUrl();
    if (!shareBase) {
      res.status(503).type("text/plain").send("Public video links are not configured.");
      return;
    }
    const videoId = param(req, "videoId");
    const [video] = await db
      .select({
        id: videos.id,
        objectPath: videos.objectPath,
        caption: videos.caption,
        visibility: videos.visibility,
        creatorName: users.displayName,
        username: users.username,
      })
      .from(videos)
      .innerJoin(users, eq(videos.creatorId, users.id))
      .where(and(eq(videos.id, videoId), eq(videos.visibility, "public")))
      .limit(1);
    if (!video) {
      res.status(404).type("text/plain").send("This public video could not be found.");
      return;
    }
    const playbackUrl = await storage.getObjectEntityReadURL(video.objectPath, 300);
    const title = `Video by @${video.username} · YOU ALL`;
    const description = video.caption || `Watch this video by ${video.creatorName} on YOU ALL.`;
    const canonicalUrl = `${shareBase}/api/share/${encodeURIComponent(video.id)}`;
    const appUrl = `youall://video/${encodeURIComponent(video.id)}`;
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#080808">
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:type" content="video.other">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:video" content="${escapeHtml(playbackUrl)}">
  <meta property="og:video:type" content="video/mp4">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <title>${escapeHtml(title)}</title>
  <style>
    :root{color-scheme:dark;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#080808;color:#f6f1e7}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}
    main{width:min(100%,520px);padding:24px;border:1px solid #2a2823;border-radius:24px;background:#151411}
    .brand{color:#d8b56a;letter-spacing:.25em;font-size:11px;font-weight:700}
    video{display:block;width:100%;max-height:68vh;aspect-ratio:9/16;object-fit:contain;background:#050505;border-radius:16px;margin-top:18px}
    h1{font-size:20px;margin:18px 0 4px}.caption{white-space:pre-wrap;color:#f6f1e7;line-height:1.55;margin:9px 0}
    .user{color:#d8b56a;font-weight:600}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
    a{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 16px;border-radius:13px;text-decoration:none;font-weight:600;font-size:13px}
    .open{background:#d8b56a;color:#15120b}.home{border:1px solid #39362d;color:#f6f1e7}
    .note{color:#9c968b;font-size:12px;line-height:1.5;margin-top:15px}
  </style>
</head>
<body>
  <main>
    <div class="brand">YOU ALL</div>
    <video controls playsinline preload="metadata" src="${escapeHtml(playbackUrl)}"></video>
    <h1 class="user">@${escapeHtml(video.username)}</h1>
    <div class="caption">${escapeHtml(description)}</div>
    <div class="actions"><a class="open" href="${escapeHtml(appUrl)}">Open in YOU ALL</a><a class="home" href="${escapeHtml(shareBase)}">Explore YOU ALL</a></div>
    <p class="note">If the app is not installed, watch the video here in your browser. Video access uses a short-lived playback link.</p>
  </main>
</body>
</html>`;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.type("html").send(html);
  }),
);

router.post(
  "/users/:userId/block",
  handle(async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const blockedId = param(req, "userId");
    if (userId === blockedId) {
      res.status(400).json({ error: "You cannot block your own account." });
      return;
    }
    await ensureProfile(userId);
    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, blockedId))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    await db
      .insert(blockedUsers)
      .values({ blockerId: userId, blockedId })
      .onConflictDoNothing();
    await db
      .delete(follows)
      .where(
        or(
          and(eq(follows.followerId, userId), eq(follows.followingId, blockedId)),
          and(eq(follows.followerId, blockedId), eq(follows.followingId, userId)),
        ),
      );
    res.json({ blocked: true });
  }),
);

router.delete(
  "/users/:userId/block",
  handle(async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    await db
      .delete(blockedUsers)
      .where(and(eq(blockedUsers.blockerId, userId), eq(blockedUsers.blockedId, param(req, "userId"))));
    res.json({ blocked: false });
  }),
);

router.get(
  "/users/blocked",
  handle(async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        createdAt: blockedUsers.createdAt,
        isFollowing: sql<boolean>`exists(select 1 from ${follows} where ${follows.followerId} = ${userId} and ${follows.followingId} = ${users.id})`,
      })
      .from(blockedUsers)
      .innerJoin(users, eq(blockedUsers.blockedId, users.id))
      .where(eq(blockedUsers.blockerId, userId))
      .orderBy(desc(blockedUsers.createdAt))
      .limit(limitFrom(req));
    res.json({
      items: rows.map(({ createdAt: _createdAt, ...user }) => ({
        ...user,
        isFollowing: Boolean(user.isFollowing),
      })),
    });
  }),
);

router.post(
  "/reports",
  handle(async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const parsed = ReportUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Choose a report reason and try again." });
      return;
    }
    await ensureProfile(userId);
    if (parsed.data.reportedUserId === userId) {
      res.status(400).json({ error: "You cannot report your own account." });
      return;
    }
    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, parsed.data.reportedUserId))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "Reported user not found." });
      return;
    }
    if (parsed.data.videoId) {
      const [video] = await db
        .select({ id: videos.id, creatorId: videos.creatorId })
        .from(videos)
        .where(eq(videos.id, parsed.data.videoId))
        .limit(1);
      if (!video || video.creatorId !== parsed.data.reportedUserId) {
        res.status(400).json({ error: "The video does not belong to this user." });
        return;
      }
    }
    if (parsed.data.messageId) {
      const [message] = await db
        .select({ id: messages.id, conversationId: messages.conversationId, senderId: messages.senderId })
        .from(messages)
        .where(eq(messages.id, parsed.data.messageId))
        .limit(1);
      if (!message) {
        res.status(404).json({ error: "Message not found." });
        return;
      }
      const participants = await db
        .select({ userId: conversationParticipants.userId })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, message.conversationId));
      const participantIds = participants.map((item) => item.userId);
      if (!participantIds.includes(userId) || !participantIds.includes(parsed.data.reportedUserId)) {
        res.status(403).json({ error: "You cannot report this message." });
        return;
      }
    }
    const id = randomUUID();
    const createdAt = new Date();
    await db.insert(userReports).values({
      id,
      reporterId: userId,
      reportedUserId: parsed.data.reportedUserId,
      videoId: parsed.data.videoId ?? null,
      messageId: parsed.data.messageId ?? null,
      reason: parsed.data.reason,
      details: parsed.data.details?.trim() ?? "",
    });
    res.status(201).json({ id, createdAt: createdAt.toISOString() });
  }),
);

export default router;
