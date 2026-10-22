# Upstream source

This directory vendors `@tmustier/pi-usage-extension` version 0.9.5.

- Source: https://github.com/tmustier/pi-extensions/tree/main/usage-extension
- Package: https://www.npmjs.com/package/@tmustier/pi-usage-extension
- License: MIT. See `LICENSE`.

The files are kept local so Pi can load `/usage` without installing another package. Check the npm package before updating these files, then update the version above.

## Local compatibility changes

`data.ts` uses a named JSON value type instead of returning `unknown`, and its two bounded worker pools use explicit promise arrays instead of `Array.from` callbacks. These changes preserve upstream behavior and satisfy this repository's static-analysis rules.
