import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const scanStatusEnum = pgEnum('scan_status', [
  'ready',
  'metadata_incomplete',
  'excluded',
  'missing',
])

export const repositories = pgTable('repositories', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull().unique(),
  rootPath: text('root_path').notNull(),
  remoteUrl: text('remote_url'),
  owner: text('owner'),
  repo: text('repo'),
  remoteIdentity: text('remote_identity'),
  team: text('team'),
  scanStatus: scanStatusEnum('scan_status').notNull(),
  active: boolean('active').notNull().default(true),
  lastScannedAt: timestamp('last_scanned_at', { withTimezone: true }),
  lastPrSyncedAt: timestamp('last_pr_synced_at', { withTimezone: true }),
  lastReviewSyncedAt: timestamp('last_review_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const syncRuns = pgTable(
  'sync_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    kind: text('kind').notNull(),
    status: text('status').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    message: text('message'),
    errorCount: integer('error_count').notNull().default(0),
    heartbeat: timestamp('heartbeat', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('sync_runs_one_running_per_kind').on(table.kind).where(sql`${table.status} = 'running'`),
  ],
)

export const pullRequests = pgTable(
  'pull_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    repositoryId: uuid('repository_id')
      .notNull()
      .references(() => repositories.id),
    githubNodeId: text('github_node_id').notNull(),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    state: text('state').notNull(),
    isDraft: boolean('is_draft').notNull().default(false),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
    githubUpdatedAt: timestamp('github_updated_at', { withTimezone: true }).notNull(),
    mergedAt: timestamp('merged_at', { withTimezone: true }),
    url: text('url').notNull(),
    missingJiraKey: boolean('missing_jira_key').notNull().default(false),
    additions: integer('additions'),
    deletions: integer('deletions'),
    changedFiles: integer('changed_files'),
    mergeCommitSha: text('merge_commit_sha'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('pull_requests_repository_id_number_unique').on(table.repositoryId, table.number)],
)

export const pullRequestReviews = pgTable(
  'pull_request_reviews',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pullRequestId: uuid('pull_request_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    githubReviewId: bigint('github_review_id', { mode: 'number' }).notNull(),
    state: text('state').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    authorLogin: text('author_login'),
    authorType: text('author_type'),
    isBot: boolean('is_bot').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('pull_request_reviews_unique_github_review').on(t.pullRequestId, t.githubReviewId),
    index('pull_request_reviews_pr_id_idx').on(t.pullRequestId),
  ],
)

export const pullRequestReviewComments = pgTable(
  'pull_request_review_comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pullRequestId: uuid('pull_request_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    githubCommentId: bigint('github_comment_id', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('pull_request_review_comments_unique_github_comment').on(
      t.pullRequestId,
      t.githubCommentId,
    ),
    index('idx_pull_request_review_comments_pr_id').on(t.pullRequestId),
  ],
)

export const syncErrors = pgTable('sync_errors', {
  id: uuid('id').defaultRandom().primaryKey(),
  syncRunId: uuid('sync_run_id')
    .notNull()
    .references(() => syncRuns.id),
  repositoryId: uuid('repository_id').references(() => repositories.id),
  source: text('source').notNull(),
  message: text('message').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
