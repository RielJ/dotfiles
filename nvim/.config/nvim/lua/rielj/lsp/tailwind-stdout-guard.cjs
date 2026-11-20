// Preloaded into tailwindcss-language-server through NODE_OPTIONS (see
// after/lsp/tailwindcss.lua). Node's fork() passes the environment on, so this
// also runs in the server's forked oxide-helper process.
//
// The helper inherits the server's stdout, which carries the LSP stream, and
// prints "Listening for messages..." with console.log. Neovim then fails with
// "Content-Length not found in header" and that client stops parsing.
// Upstream: tailwindlabs/tailwindcss-intellisense#1607 (fix in PR #1628).
// Delete this file and the NODE_OPTIONS line once a release includes the fix.
//
// Only forked IPC children have process.send. The main server talks LSP over
// stdio and routes console.log through window/logMessage, so leave it alone.
if (typeof process.send === "function") {
  const toStderr = (...args) => console.error(...args);
  console.log = toStderr;
  console.info = toStderr;
}
