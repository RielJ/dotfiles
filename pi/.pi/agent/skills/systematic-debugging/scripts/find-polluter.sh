#!/usr/bin/env bash
# Find the test that pollutes shared state, by running candidates one at a time.
# Adapted from obra/superpowers skills/systematic-debugging/find-polluter.sh (MIT, Jesse Vincent).
#
# Usage:
#   find-polluter.sh --run '<cmd with {}>' --breaks <target-test> <glob>...
#   find-polluter.sh --run '<cmd with {}>' --creates <path> <glob>...
#
#   --run      Test command; {} is replaced with one test file (or two for --breaks).
#   --breaks   Order-dependent mode: run each candidate then <target-test> in one
#              process (`{}` becomes "candidate target"); report the first pair that fails.
#   --creates  Stray-state mode: run each candidate alone; report the first one
#              after which <path> exists.
#   <glob>     Candidate test files, e.g. 'test/**/*.test.ts' (quote it).
#
# --breaks needs the runner to run both files in one process, in the order given.
# Relative paths are passed as ./path because bun reorders bare paths. Use the
# same isolation and parallelism flags as the failing suite (e.g. vitest
# --no-file-parallelism, jest --runInBand), or the pollution won't reproduce.
#
# Exit codes: 1 polluter found, 0 none found, 2 bad usage or the target already fails alone.

set -uo pipefail

usage() {
  sed -n '4,20p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

run_cmd="" target="" creates=""
while [ $# -gt 0 ]; do
  case "$1" in
    --run) run_cmd="${2:-}"; shift 2 ;;
    --breaks) target="${2:-}"; shift 2 ;;
    --creates) creates="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    --) shift; break ;;
    -*) echo "unknown option: $1" >&2; usage ;;
    *) break ;;
  esac
done

[ -n "$run_cmd" ] || usage
[ $# -gt 0 ] || usage
if [ -n "$target" ] && [ -n "$creates" ]; then echo "use --breaks or --creates, not both" >&2; usage; fi
if [ -z "$target" ] && [ -z "$creates" ]; then usage; fi
case "$run_cmd" in *"{}"*) ;; *) echo "--run must contain {}" >&2; usage ;; esac

run() {
  # $1: space-separated file list substituted for {}
  local cmd="${run_cmd//\{\}/$1}"
  bash -c "$cmd" >/dev/null 2>&1
}

# ./-prefix relative paths so runners keep the order we pass.
dot() { case "$1" in /* | ./*) printf '%s' "$1" ;; *) printf './%s' "$1" ;; esac; }

shopt -s nullglob
have_globstar=0
shopt -s globstar 2>/dev/null && have_globstar=1

expand() {
  # Prints one matching path per line. macOS /bin/bash (3.2) has no globstar,
  # so ** patterns fall back to find, also matching zero directory levels.
  local p="${1#./}" f
  case "$p" in
    *"**"*)
      if [ "$have_globstar" = 0 ]; then
        find . \( -path "./$p" -o -path "./${p//\*\*\//}" \) -type f | sed 's|^\./||' | sort -u
        return
      fi ;;
  esac
  for f in $p; do printf '%s\n' "$f"; done
}

files=()
for pattern in "$@"; do
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    [ -n "$target" ] && [ "$f" -ef "$target" ] && continue
    files+=("$(dot "$f")")
  done < <(expand "$pattern")
done
total=${#files[@]}
[ "$total" -gt 0 ] || { echo "no test files match: $*" >&2; exit 2; }

if [ -n "$target" ]; then
  [ -f "$target" ] || { echo "target not found: $target" >&2; exit 2; }
  target="$(dot "$target")"
  if ! run "$target"; then
    echo "target fails on its own; this is a real bug, not pollution: $target" >&2
    exit 2
  fi
  echo "Checking $total candidates against $target"
else
  if [ -e "$creates" ]; then
    echo "$creates already exists; remove it first" >&2
    exit 2
  fi
  echo "Checking $total candidates for creating $creates"
fi

i=0
for f in "${files[@]}"; do
  i=$((i + 1))
  echo "[$i/$total] $f"
  if [ -n "$target" ]; then
    if ! run "$f $target"; then
      # The pair can fail because the candidate itself fails; that isn't pollution.
      if ! run "$f"; then
        echo "  skipped: fails on its own"
        continue
      fi
      echo "POLLUTER: $f"
      echo "Reproduce: ${run_cmd//\{\}/$f $target}"
      exit 1
    fi
  else
    run "$f" || true
    if [ -e "$creates" ]; then
      echo "POLLUTER: $f"
      echo "Created: $creates"
      echo "Reproduce: ${run_cmd//\{\}/$f}"
      exit 1
    fi
  fi
done

echo "No polluter found among $total candidates."
exit 0
