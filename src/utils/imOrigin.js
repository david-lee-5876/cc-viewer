// IM-origin marker: messages injected by an IM bridge (currently DingTalk) carry a leading
// sentinel ⟦im:<id>⟧ so the conversation view can show which IM a message came from.
//
// KEEP IN SYNC with the marker the bridge prepends in server/lib/dingtalk-bridge.js
// (IM_ORIGIN_MARKER). The id capture group lets this extend to future IMs for free.
// U+27E6 / U+27E7 (⟦ ⟧) are virtually never typed by a human, so false positives are nil.
export const IM_ORIGIN_RE = /^⟦im:([a-z0-9_-]+)⟧[ ]?/;

/**
 * Strip a leading IM-origin marker from a message's text.
 * @param {string} text raw message text
 * @returns {{ text: string, imSource: string|null }} stripped text + the IM id (null if no marker)
 */
export function parseImOrigin(text) {
  if (typeof text !== 'string') return { text, imSource: null };
  const m = text.match(IM_ORIGIN_RE);
  if (!m) return { text, imSource: null };
  return { text: text.slice(m[0].length), imSource: m[1] };
}
