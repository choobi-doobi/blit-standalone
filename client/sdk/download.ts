/** Save `blob` to the user's downloads as `filename`. No-op outside a DOM. */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  // Firefox requires the anchor to be in the document for the click to count.
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked late: an immediate revoke can abort a large download in Chrome and Safari.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
