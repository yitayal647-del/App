import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const timestampColumn = (name: string) =>
  timestamp(name, { withTimezone: true });

export const users = pgTable(
  "yall_users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    bio: text("bio").notNull().default(""),
    avatarUrl: text("avatar_url"),
    createdAt: timestampColumn("created_at").notNull().defaultNow(),
    updatedAt: timestampColumn("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("yall_users_username_unique").on(table.username)],
);

export const videos = pgTable(
  "yall_videos",
  {
    id: text("id").primaryKey(),
    creatorId: text("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    objectPath: text("object_path").notNull(),
    caption: text("caption").notNull().default(""),
    durationSec: doublePrecision("duration_sec").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    contentType: text("content_type").notNull(),
    allowComments: boolean("allow_comments").notNull().default(true),
    createdAt: timestampColumn("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("yall_videos_object_path_unique").on(table.objectPath),
    index("yall_videos_created_at_id_idx").on(table.createdAt, table.id),
    index("yall_videos_creator_created_idx").on(table.creatorId, table.createdAt),
  ],
);

export const likes = pgTable(
  "yall_likes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    createdAt: timestampColumn("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.videoId] }),
    index("yall_likes_video_id_idx").on(table.videoId),
  ],
);

export const comments = pgTable(
  "yall_comments",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestampColumn("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("yall_comments_video_created_idx").on(table.videoId, table.createdAt),
  ],
);

export const follows = pgTable(
  "yall_follows",
  {
    followerId: text("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followingId: text("following_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestampColumn("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.followerId, table.followingId] }),
    index("yall_follows_following_idx").on(table.followingId),
  ],
);

export const notifications = pgTable(
  "yall_notifications",
  {
    id: text("id").primaryKey(),
    recipientId: text("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    videoId: text("video_id").references(() => videos.id, {
      onDelete: "cascade",
    }),
    createdAt: timestampColumn("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("yall_notifications_recipient_created_idx").on(
      table.recipientId,
      table.createdAt,
    ),
  ],
);

export const uploads = pgTable(
  "yall_uploads",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    objectPath: text("object_path").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    expiresAt: timestampColumn("expires_at").notNull(),
    publishedAt: timestampColumn("published_at"),
    createdAt: timestampColumn("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("yall_uploads_object_path_unique").on(table.objectPath),
    index("yall_uploads_user_created_idx").on(table.userId, table.createdAt),
  ],
);
