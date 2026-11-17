import { clientPlatform } from './desktop';

export async function finishOnboarding(completed: boolean, save: () => Promise<void>) {
  const platform = clientPlatform();
  if (!completed) await save();
  if (platform.kind === 'desktop-local') await platform.runtime.reconcileSetup();
}
