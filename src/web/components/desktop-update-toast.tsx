import { useEffect, useState } from 'react';
import { ArrowUp } from './icons';
import { Button } from './ui';
import {
  desktopUpdateStatus,
  downloadDesktopUpdate,
  dismissDesktopUpdate,
  restartDesktopUpdate,
  retryDesktopUpdate,
  subscribeDesktopUpdateStatus,
  type DesktopUpdateStatus,
} from '../lib/desktop';

export function DesktopUpdateToast() {
  const [status, setStatus] = useState<DesktopUpdateStatus>();
  const [restarting, setRestarting] = useState(false);
  const [failed, setFailed] = useState<{ key: string; message: string }>();
  const failure = status?.failure?.dismissed ? undefined : status?.failure;
  const statusKey = `${failure?.id ?? ''}:${status?.readyVersion ?? ''}`;

  useEffect(() => {
    let received = false;
    const unsubscribe = subscribeDesktopUpdateStatus((value) => {
      received = true;
      setStatus(value);
    });
    void desktopUpdateStatus()
      ?.then((value) => {
        if (!received) setStatus(value);
      })
      .catch(() => {});
    return unsubscribe;
  }, []);

  const version = status?.readyVersion ?? '';
  if (!status || (!failure && (!version || version === status.dismissedVersion))) return null;
  const title = failure
    ? {
        checking: 'Nod could not check for updates',
        preparing: 'Nod could not prepare the update',
        downloading: 'Nod could not download the update',
        restart: 'Nod could not restart to update',
      }[failure.phase]
    : `Nod ${version} is ready`;

  return (
    <aside className="desktop-update-toast" role="status" aria-label="Nod update">
      <span className="desktop-update-toast-icon" aria-hidden="true">
        <ArrowUp size={14} />
      </span>
      <div className="desktop-update-toast-content">
        <strong>{title}</strong>
        {failure ? (
          <>
            <p role="alert">{failure.message}</p>
            <p>You can keep using Nod.</p>
          </>
        ) : (
          <p>
            Nod will update when you quit. You can also restart now.{' '}
            <a
              href={`https://github.com/n8n-io/nod/releases/tag/nod-v${encodeURIComponent(version)}`}
              target="_blank"
              rel="noreferrer"
            >
              Release notes
            </a>
          </p>
        )}
        {failed?.key === statusKey && <p role="alert">{failed.message}</p>}
        <div className="desktop-update-toast-actions">
          <Button
            type="button"
            size="sm"
            disabled={restarting || status.checking || (!failure && status.phase !== 'ready')}
            onClick={() => {
              setRestarting(true);
              setFailed(undefined);
              void (failure ? retryDesktopUpdate(failure.id) : restartDesktopUpdate())
                .catch((error) => setFailed({ key: statusKey, message: error.message }))
                .finally(() => setRestarting(false));
            }}
          >
            {restarting
              ? 'Please wait…'
              : failure
                ? failure.phase === 'restart'
                  ? 'Retry restart'
                  : 'Try again'
                : 'Restart to update'}
          </Button>
          {failure && (
            <Button asChild variant="outline" size="sm">
              <a
                href="https://nod.n8n.io/docs/get-started/install-desktop/"
                target="_blank"
                rel="noreferrer"
                onClick={(event) => {
                  event.preventDefault();
                  void downloadDesktopUpdate().catch((error) =>
                    setFailed({ key: statusKey, message: error.message }),
                  );
                }}
              >
                Download Nod
              </a>
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={restarting}
            onClick={() => {
              setFailed(undefined);
              void dismissDesktopUpdate(failure ? failure.id : version).catch((error) =>
                setFailed({ key: statusKey, message: error.message }),
              );
            }}
          >
            {failure ? 'Dismiss' : 'Later'}
          </Button>
        </div>
      </div>
    </aside>
  );
}
