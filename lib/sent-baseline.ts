/**
 * Keep a known sent-document canonical so the editor can clear
 * "Changed since sent" as soon as Undo restores that document.
 * A save that still differs must not discard the baseline.
 */
export function baselineAfterSave(
  current: string | null,
  savedCanonical: string,
  serverChanged: boolean,
): string | null {
  return serverChanged ? current : savedCanonical
}

export function differsFromSent(baseline: string | null, stateCanonical: string, serverChanged: boolean): boolean {
  if (baseline !== null) return stateCanonical !== baseline
  return serverChanged
}
