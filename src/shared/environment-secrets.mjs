export function environmentSecrets(environment) {
  const secrets = Object.entries(environment)
    .filter(
      ([key, value]) =>
        typeof value === 'string' &&
        value.length > 0 &&
        /(?:API_KEY|SECRET|PASSWORD|VAULT_KEY)$|(?:^|_)(?:KEY|SECRET|PASSWORD|PASSWD|PASSPHRASE|CREDENTIALS?|PWD|TOKEN)(?:_|$)/i.test(
          key,
        ),
    )
    .map(([, value]) => value);
  if (typeof environment.DATABASE_URL === 'string' && environment.DATABASE_URL) {
    secrets.push(environment.DATABASE_URL);
    try {
      const password = new URL(environment.DATABASE_URL).password;
      if (password) {
        secrets.push(password);
        try {
          const decoded = decodeURIComponent(password);
          if (decoded !== password) secrets.push(decoded);
        } catch {}
      }
    } catch {}
  }
  return secrets;
}
