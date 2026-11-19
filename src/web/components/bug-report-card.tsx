import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { FeedbackReceipt, FeedbackReport } from '../../shared/feedback';
import { api, ApiError, errorMessage } from '../lib/api';
import { feedbackActivitySnapshot } from '../lib/feedback-activity';
import { feedbackClientState } from '../lib/feedback-client';
import { feedbackErrorsAvailable, feedbackErrorsSnapshot } from '../lib/feedback-errors';
import { sessionStore } from '../lib/session';
import { readUiPreference, writeUiPreference } from '../lib/ui-preferences';
import { ActionCard } from './action-card';
import { FeedbackDiagnostics, feedbackReportData } from './feedback-diagnostics';
import { AlertCircle, Bug, Check, Send } from './icons';
import { Button } from './ui';

type Draft = {
  summary: string;
  enabled: boolean;
  receipt: FeedbackReceipt | null;
};

export function BugReportCard({
  draftId,
  title,
  summary,
}: {
  draftId: string;
  title: string;
  summary: string;
}) {
  const ownerId = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot).session
    ?.user?.id;
  const reportKey = `nod.feedback.report.${ownerId ?? ''}` as const;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [receipt, setReceipt] = useState<FeedbackReceipt | null>(null);
  const [included, setIncluded] = useState(() => readUiPreference(reportKey) !== 'false');
  const [report, setReport] = useState<FeedbackReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sending = useRef(false);
  const reportRef = useRef<FeedbackReport | null>(null);
  const reportRequest = useRef<Promise<FeedbackReport | null> | null>(null);
  const sent = receipt && receipt.status !== 'rejected' ? receipt : null;

  useEffect(() => {
    const controller = new AbortController();
    api<Draft>(`/api/feedback/drafts/${draftId}`, { signal: controller.signal })
      .then((value) => {
        setDraft(value);
        if (value.receipt) applyReceipt(value.receipt);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      });
    return () => controller.abort();
  }, [draftId]);

  function applyReceipt(value: FeedbackReceipt) {
    setReceipt(value);
    setError(
      value.status === 'rejected' ? value.message || 'Couldn’t send the report. Try again.' : '',
    );
  }

  function prepareReport() {
    if (reportRef.current && Date.parse(reportRef.current.expiresAt) > Date.now())
      return Promise.resolve(reportRef.current);
    if (reportRequest.current) return reportRequest.current;
    setReportLoading(true);
    setReportError('');
    setReport(null);
    setPreview(false);
    reportRef.current = null;
    reportRequest.current = api<FeedbackReport>('/api/feedback/report', {
      method: 'POST',
      body: JSON.stringify({
        activity: feedbackActivitySnapshot(),
        errors: feedbackErrorsSnapshot(),
        errorsAvailable: feedbackErrorsAvailable(),
        client: feedbackClientState(),
      }),
      signal: AbortSignal.timeout(30_000),
    })
      .then((snapshot) => {
        if (!feedbackReportData(snapshot.content))
          throw new Error(
            'Update Nod to prepare a redacted diagnostic report, or continue without one.',
          );
        reportRef.current = snapshot;
        setReport(snapshot);
        return snapshot;
      })
      .catch((cause) => {
        setReportError(errorMessage(cause));
        return null;
      })
      .finally(() => {
        reportRequest.current = null;
        setReportLoading(false);
      });
    return reportRequest.current;
  }

  async function send() {
    if (sending.current || sent || !draft?.enabled) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const prepared = included ? await prepareReport() : null;
      if (included && !prepared) return;
      applyReceipt(
        await api<FeedbackReceipt>(`/api/feedback/drafts/${draftId}/send`, {
          method: 'POST',
          body: JSON.stringify({ reportId: prepared?.id ?? null }),
          signal: AbortSignal.timeout(90_000),
        }),
      );
    } catch (cause) {
      const rejected =
        cause instanceof ApiError &&
        ((cause.status >= 400 && cause.status < 500 && ![408, 409].includes(cause.status)) ||
          cause.status === 503);
      if (!rejected) applyReceipt({ submissionId: draftId, status: 'unknown' });
      else {
        if (cause.status === 410) {
          reportRef.current = null;
          setReport(null);
        }
        setError(errorMessage(cause));
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <ActionCard
      label={title}
      title={title}
      logo={<Bug size={20} className="bug-report-card-icon" aria-hidden="true" />}
      settled={!!sent}
      footer={
        sent?.status === 'unknown' ? (
          <div className="action-card-note" role="status">
            <p className="action-card-note-title">
              <AlertCircle size={16} aria-hidden="true" />
              Delivery not confirmed yet
            </p>
            {sent.message && <p>{sent.message}</p>}
            <button
              type="button"
              className="feedback-text-action"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  applyReceipt(await api<FeedbackReceipt>(`/api/feedback/${draftId}`));
                } catch (cause) {
                  setError(errorMessage(cause));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Check again
            </button>
          </div>
        ) : sent?.status === 'partial' ? (
          <div className="action-card-note" role="status">
            <p className="action-card-note-title">
              <AlertCircle size={16} aria-hidden="true" />
              Sent without the diagnostic report
            </p>
            {sent.message && <p>{sent.message}</p>}
            {error && (
              <p className="action-card-error" role="alert">
                {error}
              </p>
            )}
            {sent.issueUrl && (
              <a
                className="bug-report-card-link"
                href={sent.issueUrl}
                target="_blank"
                rel="noreferrer"
              >
                View report
              </a>
            )}
            {sent.canRetryAttachments && (
              <button
                type="button"
                className="feedback-text-action"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    applyReceipt(
                      await api<FeedbackReceipt>(`/api/feedback/${draftId}/retry`, {
                        method: 'POST',
                        body: '{}',
                        signal: AbortSignal.timeout(90_000),
                      }),
                    );
                  } catch (cause) {
                    setError(errorMessage(cause));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Send the report again
              </button>
            )}
          </div>
        ) : sent ? (
          <div className="action-card-footer">
            <span className="action-card-status" data-state="done" role="status">
              <Check size={16} aria-hidden="true" />
              Sent to the Nod team
            </span>
            {sent.issueUrl && (
              <a
                className="bug-report-card-link"
                href={sent.issueUrl}
                target="_blank"
                rel="noreferrer"
              >
                View report
              </a>
            )}
          </div>
        ) : (
          <div className="action-card-actions">
            {error && (
              <p className="action-card-error" role="alert">
                {error}
              </p>
            )}
            {draft && !draft.enabled && (
              <p className="bug-report-card-note">Sending isn’t enabled in this build.</p>
            )}
            <Button type="button" disabled={busy || !draft?.enabled} onClick={() => void send()}>
              <Send size={16} aria-hidden="true" />
              {busy ? 'Sending…' : 'Send report'}
            </Button>
          </div>
        )
      }
    >
      <p className="bug-report-card-summary">{draft?.summary ?? summary}</p>
      {!sent && (
        <FeedbackDiagnostics
          included={included}
          report={report}
          preview={preview}
          loading={reportLoading}
          error={reportError}
          frozen={busy}
          onToggleIncluded={() => {
            setIncluded(!included);
            if (ownerId) writeUiPreference(reportKey, String(!included));
            setPreview(false);
          }}
          onReview={async () => {
            if (report) setPreview(!preview);
            else if (!busy && (await prepareReport())) setPreview(true);
          }}
          onRefresh={() => void prepareReport()}
        />
      )}
    </ActionCard>
  );
}
