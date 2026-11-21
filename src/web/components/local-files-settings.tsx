import { useState } from 'react';
import { KeepOutList } from './keep-out-list';
import { Notice, Switch } from './ui';
import { api, errorMessage } from '../lib/api';
import { usePageData } from '../hooks/use-page-data';
import { savePreferences } from '../lib/preferences';
import type { AccountPreferences } from '../../shared/account';

type KeepOut = { available: boolean; paths: string[] };
const path = '/api/local-files/keep-out';

export function LocalFilesSettings() {
  const { data, update } = usePageData<KeepOut>(path);
  const { data: preferences, error: loadError } =
    usePageData<AccountPreferences>('/api/preferences');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!data?.available) return null;

  async function setEnabled(localFilesEnabled: boolean) {
    setBusy(true);
    setError('');
    try {
      await savePreferences({ localFilesEnabled });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function letIn(folder: string) {
    setBusy(true);
    setError('');
    try {
      const saved = await api<KeepOut>(path, {
        method: 'DELETE',
        body: JSON.stringify({ path: folder }),
      });
      update(() => saved);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="account-region">
      <div className="account-preference-row">
        <span>Local file access</span>
        <Switch
          checked={preferences?.localFilesEnabled ?? false}
          disabled={busy || !preferences}
          aria-label="Local file access"
          onCheckedChange={(enabled) => void setEnabled(enabled)}
        />
      </div>
      <p className="field-hint">
        Let Nod work with files in your home folder and external drives in work you start. You can
        also turn this on or off in chat.
      </p>
      {!!data.paths.length && (
        <KeepOutList
          title="Kept out of local files"
          hint="Nod never opens or changes anything in these folders. Tell Nod to add one; only you can remove it here."
          items={data.paths}
          removeLabel={(folder) => `Let Nod into ${folder} again`}
          disabled={busy}
          onRemove={(folder) => void letIn(folder)}
        />
      )}
      {error && <Notice onDismiss={() => setError('')}>{error}</Notice>}
      {loadError && <Notice>{loadError}</Notice>}
    </section>
  );
}
