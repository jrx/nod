import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, rm, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { FeedbackDelivery, FeedbackEnvelope } from '../ports/feedback.ts';
import type {
  FeedbackContext,
  FeedbackReceipt,
  StartupFeedbackContext,
} from '../shared/feedback.ts';
import { feedbackLimits } from '../shared/feedback.ts';
import { feedbackTechnicalContext } from './feedback-context.ts';
import {
  StartupFeedbackError,
  startupFailureMessage,
  startupStatusFacts,
  startupLogFacts,
  startupReceiptFacts,
} from '../shared/startup-feedback-facts.mjs';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const uuid = z.uuidv4();
const pendingSchema = z
  .object({
    submissionId: uuid,
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
class SavedStatusError extends StartupFeedbackError {
  readonly canPreserve: boolean;
  constructor(reason: string, canPreserve = false) {
    super(reason);
    this.canPreserve = canPreserve;
  }
}

const reviewSchema = z
  .object({
    feedback: z
      .string()
      .min(1)
      .max(feedbackLimits.text)
      .refine((value) => Boolean(value.trim())),
    includeReport: z.boolean(),
  })
  .strict();

export function createStartupFeedback(options: {
  dataRoot: string;
  delivery: FeedbackDelivery;
  context: Omit<FeedbackContext, 'enabled' | 'recipient'>;
  status: unknown;
  startupLog?: unknown;
}) {
  const context = feedbackTechnicalContext(options.context);
  const pendingPath = join(options.dataRoot, 'startup-feedback.json');
  let reviewed: { envelope: FeedbackEnvelope; expiresAt: number } | undefined;
  let reviewTimer: ReturnType<typeof setTimeout> | undefined;
  let sending: Promise<FeedbackReceipt> | undefined;
  let receipt: FeedbackReceipt | undefined;
  let pending: z.infer<typeof pendingSchema> | undefined;
  let restored: Promise<void> | undefined;
  let restoredState = false;
  let restoreFailure: { message: string; canPreserve: boolean } | undefined;
  let recovering: Promise<void> | undefined;
  let lastReviewId: string | undefined;
  let notSentSubmissionId: string | undefined;

  async function readBytes(file: FileHandle, limit: number) {
    const bytes = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await file.read(bytes, length, bytes.length - length, length);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    return bytes.subarray(0, length);
  }

  async function openStatus() {
    const before = await lstat(pendingPath);
    if (!before.isFile() || before.nlink !== 1) throw new SavedStatusError('status_regular');
    const file = await open(pendingPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.nlink !== 1 || info.dev !== before.dev || info.ino !== before.ino)
        throw new SavedStatusError('status_changed');
      return { file, info };
    } catch (error) {
      await file.close();
      throw error;
    }
  }

  function restore() {
    if (restoredState) return Promise.resolve();
    return (restored ??= (async () => {
      try {
        const { file, info } = await openStatus();
        let value;
        try {
          const bytes = await readBytes(file, 1024);
          if (bytes.length > 1024) throw new SavedStatusError('status_large', info.size <= 65_536);
          let parsed;
          try {
            parsed = JSON.parse(bytes.toString('utf8'));
          } catch {
            throw new SavedStatusError('status_json', true);
          }
          const checked = pendingSchema.safeParse(parsed);
          if (!checked.success) throw new SavedStatusError('status_fields', true);
          value = checked.data;
        } finally {
          await file.close();
        }
        pending = value;
        restoredState = true;
        restoreFailure = undefined;
      } catch (cause) {
        const error = cause as NodeJS.ErrnoException;
        if (error.code === 'ENOENT' && !restoreFailure) {
          restoredState = true;
          return;
        }
        restoreFailure =
          cause instanceof SavedStatusError
            ? { message: cause.message, canPreserve: cause.canPreserve }
            : {
                message: startupFailureMessage(new StartupFeedbackError('status_read', cause)),
                canPreserve: false,
              };
        throw cause instanceof SavedStatusError
          ? cause
          : new StartupFeedbackError('status_read', cause);
      }
    })().finally(() => {
      restored = undefined;
    }));
  }

  async function syncStatusDirectory() {
    if (process.platform === 'win32') return;
    const directory = await open(options.dataRoot, 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }

  async function savePending(
    value: z.infer<typeof pendingSchema> | undefined,
    published = () => {},
  ) {
    if (!value) {
      await rm(pendingPath, { force: true });
      await syncStatusDirectory();
      return;
    }
    const temporary = `${pendingPath}.${randomUUID()}.tmp`;
    try {
      await mkdir(options.dataRoot, { recursive: true, mode: 0o700 });
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify(value));
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, pendingPath);
      published();
      await syncStatusDirectory();
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
  }

  async function report() {
    return JSON.stringify(
      {
        schema: 'nod-desktop-startup-report-v2',
        context,
        startup: startupStatusFacts(options.status),
        startupLog: { scope: 'current-desktop-process', ...startupLogFacts(options.startupLog) },
        coverage:
          'Only bounded startup facts are collected. Startup prose, logs, paths, URLs, identifiers, chat, app content, settings and database records are omitted.',
      },
      null,
      2,
    );
  }

  function present(value: FeedbackReceipt) {
    if (reviewed && reviewed.expiresAt <= Date.now()) reviewed = undefined;
    const safe = startupReceiptFacts(value, value.submissionId);
    return {
      ...safe,
      ...(safe.status === 'partial' && {
        canRetryAttachments: Boolean(
          reviewed?.envelope.submissionId === safe.submissionId &&
          reviewed.envelope.report &&
          reviewed.expiresAt > Date.now(),
        ),
      }),
    };
  }

  function recover(input: unknown) {
    z.object({ confirm: z.literal(true) })
      .strict()
      .parse(input);
    return (recovering ??= (async () => {
      await restore().catch(() => {});
      if (restoredState || !restoreFailure?.canPreserve)
        throw new StartupFeedbackError('status_check');
      const { file, info } = await openStatus();
      let bytes;
      try {
        bytes = await readBytes(file, 65_536);
        const after = await file.stat();
        if (bytes.length > 65_536) throw new StartupFeedbackError('preserve_large');
        if (
          info.size !== bytes.length ||
          info.size !== after.size ||
          info.mtimeMs !== after.mtimeMs ||
          info.ctimeMs !== after.ctimeMs
        )
          throw new StartupFeedbackError('status_changed');
      } finally {
        await file.close();
      }
      const backupPath = join(options.dataRoot, `startup-feedback-recovered-${randomUUID()}.bin`);
      let created = false;
      let preserved = false;
      try {
        const backup = await open(backupPath, 'wx', 0o600);
        created = true;
        try {
          await backup.writeFile(bytes);
          await backup.sync();
        } finally {
          await backup.close();
        }
        await syncStatusDirectory();
        preserved = true;
        const current = await lstat(pendingPath);
        if (
          !current.isFile() ||
          current.nlink !== 1 ||
          current.dev !== info.dev ||
          current.ino !== info.ino ||
          current.size !== info.size ||
          current.mtimeMs !== info.mtimeMs ||
          current.ctimeMs !== info.ctimeMs
        )
          throw new StartupFeedbackError('status_changed');
        await rm(pendingPath);
        pending = undefined;
        receipt = undefined;
        reviewed = undefined;
        lastReviewId = undefined;
        notSentSubmissionId = undefined;
        clearTimeout(reviewTimer);
        restoreFailure = undefined;
        restoredState = true;
        await syncStatusDirectory();
      } catch (error) {
        if (created && !preserved) await rm(backupPath, { force: true }).catch(() => {});
        throw error;
      }
    })().finally(() => {
      recovering = undefined;
    }));
  }

  async function status(refresh = false) {
    await restore();
    if (sending) return sending;
    if (!pending) return null;
    const current = pending;
    if (refresh || !receipt || receipt.status === 'unknown') {
      const value = startupReceiptFacts(
        await options.delivery.status(current.submissionId, current.payloadHash),
        current.submissionId,
      );
      if (pending === current && !sending) receipt = value;
      return present(value);
    }
    return present(receipt);
  }

  return {
    async context(): Promise<StartupFeedbackContext> {
      const value = {
        ...context,
        enabled: options.delivery.configured,
        recipient: options.delivery.recipient,
        ...(notSentSubmissionId && { notSentSubmissionId }),
      };
      try {
        await restore();
      } catch (error) {
        if (!restoreFailure) throw error;
        return { ...value, pending: null, recovery: { ...restoreFailure } };
      }
      return { ...value, pending: await status() };
    },
    async review(input: unknown) {
      await restore();
      const value = reviewSchema.parse(input);
      if (!options.delivery.configured) throw new StartupFeedbackError('disabled');
      if (sending || (pending && (!receipt || receipt.status === 'unknown')))
        throw new StartupFeedbackError('previous_status');
      const content = value.includeReport ? await report() : null;
      if (content && Buffer.byteLength(content) > feedbackLimits.reportBytes)
        throw new StartupFeedbackError('report_large');
      const attachment = content
        ? {
            name: 'nod-diagnostic-report.json',
            mimeType: 'application/json',
            data: Buffer.from(content).toString('base64'),
            sha256: hash(content),
          }
        : undefined;
      const canonical = {
        schemaVersion: 1 as const,
        submissionId: randomUUID(),
        category: 'bug' as const,
        feedback: value.feedback,
        computerName: null,
        ...context,
        report: attachment ?? null,
        attachments: [],
      };
      reviewed = {
        envelope: {
          ...canonical,
          report: attachment,
          payloadHash: hash(JSON.stringify(canonical)),
        },
        expiresAt: Date.now() + 3_600_000,
      };
      clearTimeout(reviewTimer);
      const reviewId = canonical.submissionId;
      lastReviewId = reviewId;
      notSentSubmissionId = undefined;
      reviewTimer = setTimeout(() => {
        if (reviewed?.envelope.submissionId === reviewId) reviewed = undefined;
      }, 3_600_000);
      reviewTimer.unref();
      return {
        reviewId: canonical.submissionId,
        feedback: value.feedback,
        content,
        recipient: options.delivery.recipient,
      };
    },
    async send(input: unknown) {
      await restore();
      const id = uuid.parse(input);
      if (pending?.submissionId === id) return (await status())!;
      if (!reviewed || reviewed.envelope.submissionId !== id || reviewed.expiresAt <= Date.now()) {
        if (lastReviewId === id) {
          notSentSubmissionId = id;
          reviewed = undefined;
          clearTimeout(reviewTimer);
        }
        throw new StartupFeedbackError('review_required');
      }
      if (sending || (pending && (!receipt || receipt.status === 'unknown')))
        throw new StartupFeedbackError('previous_send');
      const envelope = reviewed.envelope;
      const previousPending = pending;
      const previousReceipt = receipt;
      pending = { submissionId: id, payloadHash: envelope.payloadHash };
      receipt = undefined;
      sending = (async () => {
        let published = false;
        try {
          await savePending(pending, () => {
            published = true;
          });
        } catch (error) {
          try {
            if (published) await savePending(previousPending);
          } catch (rollback) {
            throw new StartupFeedbackError(
              'rollback_failed',
              new AggregateError([error, rollback]),
            );
          }
          pending = previousPending;
          receipt = previousReceipt;
          notSentSubmissionId = id;
          reviewed = undefined;
          clearTimeout(reviewTimer);
          throw error;
        }
        notSentSubmissionId = undefined;
        receipt = startupReceiptFacts(await options.delivery.submit(envelope), id);
        return present(receipt);
      })().finally(() => {
        sending = undefined;
      });
      return sending;
    },
    async repair(input: unknown) {
      await restore();
      const id = uuid.parse(input);
      if (!pending || pending.submissionId !== id)
        throw new StartupFeedbackError('original_required');
      if (sending) return sending;
      if (receipt?.status !== 'partial') throw new StartupFeedbackError('partial_required');
      if (
        !reviewed ||
        reviewed.envelope.submissionId !== id ||
        !reviewed.envelope.report ||
        reviewed.expiresAt <= Date.now()
      )
        throw new StartupFeedbackError('bytes_unavailable');
      const envelope = reviewed.envelope;
      receipt = undefined;
      sending = (async () => {
        receipt = startupReceiptFacts(
          await options.delivery.submit({ ...envelope, action: 'repair' }),
          id,
        );
        return present(receipt);
      })().finally(() => {
        sending = undefined;
      });
      return sending;
    },
    recover,
    status: () => status(true),
  };
}
