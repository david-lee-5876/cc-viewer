// Single source of truth for voice-pack event keys + their default bindings.
//
// Why a shared module: this list was previously duplicated across
//   - lib/voice-pack-manager.js (EVENT_KEYS for whitelist + reconcile)
//   - server.js (preferences merge / reconcile)
//   - src/AppBase.jsx (initial state default)
//   - src/components/VoicePackSettings.jsx (UI rows + reset handler)
//   - scripts/gen-placeholder-voicepack.js (pattern table keys)
//   - src/components/AskTimeoutCountdown.jsx (threshold list keys)
// Adding a 6th event meant editing 5+ files and any miss silently dropped audio
//(). All consumers now import from here.

export const EVENT_KEYS = [
  'planApproval',
  'askQuestion',
  'timeoutWarning5min',
  'timeoutWarning60s',
  'turnEnd',
];

// Per-event default binding when no user override is set:
//   - 'default' → play the bundled default-pack audio
//   - null      → event is OFF by default (user must opt in)
// turnEnd defaults to null because firing on every Claude reply is noisy
//( — frequency overload mitigation).
export const DEFAULT_BINDINGS = Object.freeze({
  planApproval: 'default',
  askQuestion: 'default',
  timeoutWarning5min: 'default',
  timeoutWarning60s: 'default',
  turnEnd: null,
});
