/** The part of the newsletter an editor event belongs to, from the nearest data-preview-target. */
export function previewTargetOf(event: { target: EventTarget | null }): string | null {
  return event.target instanceof Element
    ? (event.target.closest<HTMLElement>('[data-preview-target]')?.dataset.previewTarget ?? null)
    : null
}
