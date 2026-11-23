import { randomUUID } from "node:crypto";
import {
  and,
  count,
  desc,
  eq,
  gt,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  SendMessageBody,
  StartConversationBody,
  UpdateMessagingSettingsBody,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  blockedUsers,
  conversationParticipants,
  conversations,
  follows,
  messageSettings,
  messages,
  users,
} from "@workspace/db/schema";
import {
  Router,
  type IRouter,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { logger } from "../lib/logger";
import { ensureProfile } from "./yall";

const router: IRouter = Router();
const MESSAGE_MAX_LENGTH = 2000;
const MESSAGE_RATE_LIMIT = 20;
type AsyncHandler = (req: Request, res: Response) => Promise<void>;

function handle(handler: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    void handler(req, res).catch((error: unknown) => {
      logger.error(
        { err: error, method: req.method, path: req.path },
        "YOU ALL messaging API request failed",
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

function pageSize(req: Request, fallback = 30, maximum = 50) {
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

async function isBlockedBetween(firstId: string, secondId: string) {
  const [block] = await db
    .select({ blockerId: blockedUsers.blockerId })
    .from(blockedUsers)
    .where(
      or(
        and(eq(blockedUsers.blockerId, firstId), eq(blockedUsers.blockedId, secondId)),
        and(eq(blockedUsers.blockerId, secondId), eq(blockedUsers.blockedId, firstId)),
      ),
    )
    .limit(1);
  return Boolean(block);
}

async function canReceiveMessage(senderId: string, recipientId: string) {
  if (senderId === recipientId || (await isBlockedBetween(senderId, recipientId))) return false;
  const [setting] = await db
    .select({ allowFrom: messageSettings.allowFrom })
    .from(messageSettings)
    .where(eq(messageSettings.userId, recipientId))
    .limit(1);
  const policy = setting?.allowFrom ?? "followers";
  if (policy === "everyone") return true;
  if (policy === "nobody") return false;

  const [senderFollowsRecipient] = await db
    .select({ followerId: follows.followerId })
    .from(follows)
    .where(and(eq(follows.followerId, senderId), eq(follows.followingId, recipientId)))
    .limit(1);
  if (policy === "followers") return Boolean(senderFollowsRecipient);

  const [recipientFollowsSender] = await db
    .select({ followerId: follows.followerId })
    .from(follows)
    .where(and(eq(follows.followerId, recipientId), eq(follows.followingId, senderId)))
    .limit(1);
  if (policy === "following") return Boolean(recipientFollowsSender);
  return Boolean(senderFollowsRecipient && recipientFollowsSender);
}

async function getParticipant(conversationId: string, userId: string) {
  const [participant] = await db
    .select({
      conversationId: conversationParticipants.conversationId,
      userId: conversationParticipants.userId,
      lastReadAt: conversationParticipants.lastReadAt,
    })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    )
    .limit(1);
  return participant;
}

router.get(
  "/profiles/me/messaging-settings",
  handle(async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    await ensureProfile(userId);
    const [setting] = await db
      .select({ allowFrom: messageSettings.allowFrom })
      .from(messageSettings)
      .where(eq(messageSettings.userId, userId))
      .limit(1);
    res.json({ allowFrom: setting?.allowFrom ?? "followers" });
  }),
);

router.patch(
  "/profiles/me/messaging-settings",
  handle(async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const parsed = UpdateMessagingSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Choose a valid message privacy setting." });
      return;
    }
    await ensureProfile(userId);
    await db
      .insert(messageSettings)
      .values({ userId, allowFrom: parsed.data.allowFrom, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: messageSettings.userId,
        set: { allowFrom: parsed.data.allowFrom, updatedAt: new Date() },
      });
    res.json({ allowFrom: parsed.data.allowFrom });
  }),
);

router.get(
  "/conversations",
  handle(async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const rows = await db
      .select({
        id: conversations.id,
        userOneId: conversations.userOneId,
        userTwoId: conversations.userTwoId,
        updatedAt: conversations.updatedAt,
        lastReadAt: conversationParticipants.lastReadAt,
        otherUserId: sql<string>`case when ${conversations.userOneId} = ${userId} then ${conversations.userTwoId} else ${conversations.userOneId} end`,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        lastMessage: sql<string | null>`(select ${messages.body} from ${messages} where ${messages.conversationId} = ${conversations.id} order by ${messages.createdAt} desc, ${messages.id} desc limit 1)`,
        unreadCount: sql<number>`cast((select count(*) from ${messages} where ${messages.conversationId} = ${conversations.id} and ${messages.senderId} <> ${userId} and (${conversationParticipants.lastReadAt} is null or ${messages.createdAt} > ${conversationParticipants.lastReadAt})) as integer)`,
      })
      .from(conversationParticipants)
      .innerJoin(conversations, eq(conversationParticipants.conversationId, conversations.id))
      .innerJoin(
        users,
        eq(
          users.id,
          sql<string>`case when ${conversations.userOneId} = ${userId} then ${conversations.userTwoId} else ${conversations.userOneId} end`,
        ),
      )
      .where(eq(conversationParticipants.userId, userId))
      .orderBy(desc(conversations.updatedAt))
      .limit(100);

    const blocked = await db
      .select({ blockerId: blockedUsers.blockerId, blockedId: blockedUsers.blockedId })
      .from(blockedUsers)
      .where(or(eq(blockedUsers.blockerId, userId), eq(blockedUsers.blockedId, userId)));
    const blockedPairs = new Set(blocked.map((item) => `${item.blockerId}:${item.blockedId}`));
    const items = rows
      .filter(
        (item) =>
          !blockedPairs.has(`${userId}:${item.otherUserId}`) &&
          !blockedPairs.has(`${item.otherUserId}:${userId}`),
      )
      .map((item) => ({
        id: item.id,
        otherUser: {
          id: item.otherUserId,
          username: item.username,
          displayName: item.displayName,
          avatarUrl: item.avatarUrl,
        },
        lastMessage: item.lastMessage,
        updatedAt: item.updatedAt.toISOString(),
        unreadCount: Number(item.unreadCount),
      }));
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ items });
  }),
);

router.post(
  "/conversations",
  handle(async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const parsed = StartConversationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Choose a creator to message." });
      return;
    }
    const otherId = parsed.data.userId;
    if (userId === otherId) {
      res.status(400).json({ error: "You cannot message yourself." });
      return;
    }
    const [recipient] = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, otherId))
      .limit(1);
    if (!recipient) {
      res.status(404).json({ error: "Creator not found." });
      return;
    }
    if (!(await canReceiveMessage(userId, otherId))) {
      res.status(403).json({ error: "This creator's message privacy setting does not allow a new chat." });
      return;
    }
    await ensureProfile(userId);

    const [userOneId, userTwoId] = [userId, otherId].sort((a, b) => a.localeCompare(b));
    let created = false;
    const [conversation] = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.userOneId, userOneId), eq(conversations.userTwoId, userTwoId)))
        .limit(1);
      let conversationId = existing?.id;
      if (!conversationId) {
        conversationId = randomUUID();
        const now = new Date();
        const [inserted] = await tx
          .insert(conversations)
          .values({ id: conversationId, userOneId, userTwoId, createdAt: now, updatedAt: now })
          .onConflictDoNothing()
          .returning({ id: conversations.id });
        conversationId = inserted?.id ?? conversationId;
        created = Boolean(inserted);
      }
      await tx.insert(conversationParticipants).values([
        { conversationId, userId: userOneId },
        { conversationId, userId: userTwoId },
      ]).onConflictDoNothing();
      return [{ id: conversationId }];
    });

    const [lastMessage] = await db
      .select({ body: messages.body })
      .from(messages)
      .where(eq(messages.conversationId, conversation.id))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(1);
    const [currentParticipant] = await db
      .select({ lastReadAt: conversationParticipants.lastReadAt })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversation.id),
          eq(conversationParticipants.userId, userId),
        ),
      )
      .limit(1);
    const [unreadCount] = await db
      .select({ value: count() })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversation.id),
          sql`${messages.senderId} <> ${userId}`,
          currentParticipant?.lastReadAt
            ? gt(messages.createdAt, currentParticipant.lastReadAt)
            : undefined,
        ),
      );
    res.status(created ? 201 : 200).json({
      id: conversation.id,
      otherUser: recipient,
      lastMessage: lastMessage?.body ?? null,
      updatedAt: new Date().toISOString(),
      unreadCount: Number(unreadCount?.value ?? 0),
    });
  }),
);

router.get(
  "/conversations/:conversationId/messages",
  handle(async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const conversationId = param(req, "conversationId");
    const participant = await getParticipant(conversationId, userId);
    if (!participant) {
      res.status(403).json({ error: "You are not part of this conversation." });
      return;
    }
    const [conversation] = await db
      .select({
        userOneId: conversations.userOneId,
        userTwoId: conversations.userTwoId,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found." });
      return;
    }
    const otherId = conversation.userOneId === userId ? conversation.userTwoId : conversation.userOneId;
    if (await isBlockedBetween(userId, otherId)) {
      res.status(403).json({ error: "Messaging is unavailable for this conversation." });
      return;
    }

    const now = new Date();
    await db
      .update(conversationParticipants)
      .set({ lastReadAt: now })
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, userId),
        ),
      );
    const limit = pageSize(req);
    const cursorValue = queryString(req, "cursor");
    const cursor = decodeCursor(cursorValue);
    if (cursorValue && !cursor) {
      res.status(400).json({ error: "Invalid page cursor." });
      return;
    }
    const predicates = [eq(messages.conversationId, conversationId)];
    if (cursor) {
      predicates.push(
        or(
          lt(messages.createdAt, cursor.createdAt),
          and(eq(messages.createdAt, cursor.createdAt), lt(messages.id, cursor.id)),
        )!,
      );
    }
    const [otherParticipant] = await db
      .select({ lastReadAt: conversationParticipants.lastReadAt })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, otherId),
        ),
      )
      .limit(1);
    const rows = await db
      .select({
        id: messages.id,
        body: messages.body,
        createdAt: messages.createdAt,
        senderId: messages.senderId,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(and(...predicates))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const items = page.map((message) => ({
      id: message.id,
      sender: {
        id: message.senderId,
        username: message.username,
        displayName: message.displayName,
        avatarUrl: message.avatarUrl,
      },
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      isRead:
        message.senderId === userId
          ? Boolean(otherParticipant?.lastReadAt && otherParticipant.lastReadAt >= message.createdAt)
          : true,
    }));
    const last = page.at(-1);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      items,
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    });
  }),
);

router.post(
  "/conversations/:conversationId/messages",
  handle(async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const parsed = SendMessageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Write a message under 2,000 characters." });
      return;
    }
    const body = parsed.data.body.trim();
    if (!body || body.length > MESSAGE_MAX_LENGTH) {
      res.status(400).json({ error: "Write a message under 2,000 characters." });
      return;
    }
    const conversationId = param(req, "conversationId");
    const participant = await getParticipant(conversationId, userId);
    if (!participant) {
      res.status(403).json({ error: "You are not part of this conversation." });
      return;
    }
    const [conversation] = await db
      .select({
        userOneId: conversations.userOneId,
        userTwoId: conversations.userTwoId,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found." });
      return;
    }
    const recipientId = conversation.userOneId === userId ? conversation.userTwoId : conversation.userOneId;
    if (!(await canReceiveMessage(userId, recipientId))) {
      res.status(403).json({ error: "This creator's message privacy setting no longer allows messages." });
      return;
    }
    const minuteAgo = new Date(Date.now() - 60 * 1000);
    const [recentCount] = await db
      .select({ value: count() })
      .from(messages)
      .where(and(eq(messages.senderId, userId), gt(messages.createdAt, minuteAgo)));
    if (Number(recentCount?.value ?? 0) >= MESSAGE_RATE_LIMIT) {
      res.status(429).json({ error: "You are sending messages too quickly. Try again in a minute." });
      return;
    }
    const now = new Date();
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(messages).values({ id, conversationId, senderId: userId, body, createdAt: now });
      await tx
        .update(conversations)
        .set({ updatedAt: now })
        .where(eq(conversations.id, conversationId));
      await tx
        .update(conversationParticipants)
        .set({ lastReadAt: now })
        .where(
          and(
            eq(conversationParticipants.conversationId, conversationId),
            eq(conversationParticipants.userId, userId),
          ),
        );
    });
    const [sender] = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    res.status(201).json({
      id,
      sender,
      body,
      createdAt: now.toISOString(),
      isRead: false,
    });
  }),
);

export default router;
