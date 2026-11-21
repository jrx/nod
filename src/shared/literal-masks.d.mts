export function createLiteralMasker(
  entries: ReadonlyArray<readonly [string, string]>,
): (value: string) => string;
