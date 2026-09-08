"use strict";

// Make an untrusted string safe to echo on one log or error line: drop control
// characters (so it cannot inject a newline, a carriage return, or a terminal escape)
// and cap the length so a huge value cannot flood the line. Used for the verse request
// echoed by findVerseIndex and for paths echoed by the store. Built as a code-point
// scan rather than a regex so no control byte need appear in this source.
function safeLabel(value, max = 40) {
  let out = "";
  for (const ch of String(value)) {
    const code = ch.codePointAt(0);
    // C0 controls (incl. newline/CR) and DEL, plus the C1 control block U+0080–U+009F.
    if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) continue;
    out += ch;
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

module.exports = { safeLabel };
