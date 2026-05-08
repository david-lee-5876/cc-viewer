// AskUserQuestion options[].description is schema-optional; centralize fallback
// so AskQuestionForm and ChatMessage recap stay aligned.

export function optionAriaLabel(opt) {
  if (!opt || opt.label == null) return '';
  return opt.description
    ? `${opt.label}: ${opt.description}`
    : String(opt.label);
}

export function hasOptionDescription(opt) {
  return Boolean(opt && opt.description);
}
