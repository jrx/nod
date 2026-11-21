import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import type { Connection } from '../../shared/contracts';
import { errorMessage } from '../lib/api';
import { connectionIdentity, connectionIssue } from '../lib/secondary-pages';
import {
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Unlink,
  UserRound,
} from './icons';
import { ServiceLogo } from './service-logo';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Field,
  Input,
  Notice,
} from './ui';

function accountLabel(account: Connection) {
  const identity = connectionIdentity(account);
  return account.slug === 'notion' && identity.secondary
    ? `${identity.primary} · ${identity.secondary}`
    : (identity.secondary ?? identity.primary);
}

export function AppAccountManager({
  group,
  suspended = false,
  busy,
  error,
  titleRef,
  onDismissError,
  onClose,
  onConnect,
  onDisconnect,
  onRename,
  onRestoreFocus,
  onKeyboard,
}: {
  group?: { key: string; service: Connection; accounts: Connection[] };
  suspended?: boolean;
  busy: boolean;
  error?: string;
  titleRef?: RefObject<HTMLHeadingElement | null>;
  onDismissError(): void;
  onClose(): void;
  onConnect(account: Connection, addAccount: boolean): void;
  onDisconnect(account: Connection): Promise<void>;
  onRename?(service: string, name: string): Promise<void>;
  onRestoreFocus(): void;
  onKeyboard?(): void;
}) {
  const ownTitle = useRef<HTMLHeadingElement>(null);
  const title = titleRef ?? ownTitle;
  const accountTrigger = useRef<HTMLButtonElement | null>(null);
  const keepAccount = useRef<HTMLButtonElement>(null);
  const removing = useRef(false);
  const renameButton = useRef<HTMLButtonElement>(null);
  const renameInput = useRef<HTMLInputElement>(null);
  const restoreRenameFocus = useRef(false);
  const [selected, setSelected] = useState<Connection>();
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState('');
  const [nameDraft, setNameDraft] = useState<string>();
  const [savingName, setSavingName] = useState(false);
  const [renameError, setRenameError] = useState('');
  const editingName = nameDraft !== undefined;
  const name = nameDraft?.trim();
  const addAccount =
    group?.accounts.find(
      (account) => account.slug === group.service.slug && account.status !== 'not_configured',
    ) ??
    (group?.service.direct ? group.service : undefined) ??
    group?.accounts.find((account) => account.status !== 'not_configured') ??
    group?.service;
  const showAddAccount = !addAccount?.browserUrl && !addAccount?.savedLogin;

  useEffect(() => {
    setSelected(undefined);
    setDisconnectError('');
    setNameDraft(undefined);
    setRenameError('');
    accountTrigger.current = null;
  }, [group?.key]);

  useEffect(() => {
    if (!editingName && restoreRenameFocus.current) {
      restoreRenameFocus.current = false;
      renameButton.current?.focus({ preventScroll: true });
    }
  }, [editingName]);

  useEffect(() => {
    if (renameError && !savingName) renameInput.current?.focus({ preventScroll: true });
  }, [renameError, savingName]);

  function finishRenaming() {
    restoreRenameFocus.current = true;
    setNameDraft(undefined);
    setRenameError('');
  }

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!group || !onRename || busy || savingName || !name || name === group.service.name) return;
    setSavingName(true);
    setRenameError('');
    try {
      await onRename(group.service.slug, name);
      finishRenaming();
    } catch (cause) {
      setRenameError(errorMessage(cause));
    } finally {
      setSavingName(false);
    }
  }

  function restoreAccountFocus() {
    const id = accountTrigger.current?.dataset.disconnectAccount;
    const previous = Array.from(
      title.current
        ?.closest('[role="dialog"]')
        ?.querySelectorAll<HTMLButtonElement>('[data-disconnect-account]') ?? [],
    ).find((button) => button.dataset.disconnectAccount === id);
    const target = previous ?? title.current;
    if (target?.isConnected) target.focus({ preventScroll: true });
    else onRestoreFocus();
  }

  async function disconnect() {
    if (!selected || removing.current || busy) return;
    removing.current = true;
    setDisconnecting(true);
    setDisconnectError('');
    try {
      await onDisconnect(selected);
      setSelected(undefined);
    } catch (cause) {
      setDisconnectError(errorMessage(cause));
    } finally {
      removing.current = false;
      setDisconnecting(false);
    }
  }

  return (
    <>
      <Dialog
        open={Boolean(group?.accounts.length) && !suspended && !selected}
        onOpenChange={(open) => {
          if (!open && !selected && !savingName) onClose();
        }}
      >
        <DialogContent
          className="app-manage-dialog"
          aria-describedby={undefined}
          aria-busy={savingName || undefined}
          onEscapeKeyDown={(event) => {
            if (!editingName) return;
            event.preventDefault();
            if (!savingName) finishRenaming();
          }}
          onKeyDownCapture={(event) => {
            if (event.key !== 'Escape') onKeyboard?.();
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            restoreAccountFocus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!suspended && !selected) onRestoreFocus();
          }}
        >
          <div className="dialog-heading app-manage-heading">
            {group && <ServiceLogo {...group.service} size={28} />}
            <DialogTitle ref={title} tabIndex={-1}>
              {group?.service.name} accounts
            </DialogTitle>
          </div>
          {error && (
            <div data-analytics-private>
              <Notice onDismiss={onDismissError}>{error}</Notice>
            </div>
          )}
          <div className="app-manage-accounts" role="list">
            {group?.accounts.map((account) => {
              const identity = connectionIdentity(account);
              const issue = connectionIssue(account);
              const label = accountLabel(account);
              return (
                <div className="compact-account" key={account.connectionId} role="listitem">
                  <span className="app-account-avatar" aria-hidden="true">
                    <UserRound size={18} />
                  </span>
                  <div className="compact-account-details" data-analytics-private>
                    <span className="compact-account-name">{identity.primary}</span>
                    {identity.secondary && (
                      <span className="compact-account-email">{identity.secondary}</span>
                    )}
                    <span
                      className="app-account-status"
                      data-attention={Boolean(issue) || undefined}
                    >
                      {issue ? (
                        <CircleAlert size={12} aria-hidden="true" />
                      ) : (
                        <CircleCheck size={12} aria-hidden="true" />
                      )}
                      {issue ?? 'Connected'}
                    </span>
                  </div>
                  <div className="app-account-actions">
                    {account.canReconnect && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="account-reconnect"
                        aria-label={`Reconnect ${label} to ${account.name}`}
                        title={`Reconnect ${label}`}
                        disabled={busy || editingName}
                        onClick={() => onConnect(account, false)}
                      >
                        <RefreshCw size={16} aria-hidden="true" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="account-disconnect"
                      data-disconnect-account={account.connectionId}
                      aria-label={`Disconnect ${label} from ${account.name}`}
                      title={`Disconnect ${label}`}
                      disabled={busy || editingName}
                      onClick={(event) => {
                        accountTrigger.current = event.currentTarget;
                        setDisconnectError('');
                        setSelected(account);
                      }}
                    >
                      <Unlink size={16} aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          {editingName && (
            <form className="app-rename-form" onSubmit={(event) => void saveName(event)}>
              <Field label="App name">
                <Input
                  ref={renameInput}
                  autoFocus
                  value={nameDraft}
                  required
                  maxLength={80}
                  readOnly={savingName}
                  data-analytics-private
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => setNameDraft(event.target.value)}
                />
              </Field>
              {renameError && (
                <div data-analytics-private>
                  <Notice>{renameError}</Notice>
                </div>
              )}
              <div className="dialog-actions">
                <Button
                  type="button"
                  variant="outline"
                  disabled={savingName}
                  onClick={finishRenaming}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={busy || savingName || !name || name === group?.service.name}
                >
                  {savingName ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </form>
          )}
          {!editingName && (onRename || showAddAccount) && (
            <div className="dialog-actions app-manage-actions">
              {onRename && group && (
                <Button
                  ref={renameButton}
                  variant="outline"
                  disabled={busy}
                  onClick={() => setNameDraft(group.service.name)}
                >
                  <Pencil size={16} aria-hidden="true" />
                  Rename
                </Button>
              )}
              {showAddAccount && (
                <Button
                  data-add-account
                  disabled={busy || addAccount?.status === 'not_configured'}
                  onClick={() => addAccount && onConnect(addAccount, true)}
                >
                  {busy ? (
                    <LoaderCircle size={16} className="spin" aria-hidden="true" />
                  ) : (
                    <Plus size={16} aria-hidden="true" />
                  )}
                  Add account
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open && !disconnecting) setSelected(undefined);
        }}
      >
        <DialogContent
          className="app-disconnect-dialog"
          aria-busy={disconnecting}
          onKeyDownCapture={(event) => {
            if (event.key !== 'Escape') onKeyboard?.();
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            keepAccount.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreAccountFocus();
          }}
        >
          <DialogTitle>
            Disconnect from{' '}
            {selected?.canRename ? selected.name : selected?.name.replace(/\s+MCP$/i, '')}?
          </DialogTitle>
          <DialogDescription data-analytics-private>
            {selected && accountLabel(selected)}
            <span>Nod will lose access to this account. You can connect it again later.</span>
          </DialogDescription>
          {disconnectError && (
            <div data-analytics-private>
              <Notice>{disconnectError}</Notice>
            </div>
          )}
          <div className="app-disconnect-actions">
            <Button
              ref={keepAccount}
              data-keep-account
              variant="outline"
              disabled={disconnecting}
              onClick={() => setSelected(undefined)}
            >
              Keep account
            </Button>
            <Button
              variant="destructive"
              disabled={disconnecting}
              onClick={() => void disconnect()}
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
