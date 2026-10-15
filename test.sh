#!/usr/bin/env bash
set -uo pipefail

# Render flip's viewer in Electron, mirroring flip's CLI and discovery.
# Usage: ./test.sh [-s|-r] <directory>

app_dir="$(cd "$(dirname "$0")" && pwd)"
electron_bin="$app_dir/node_modules/.bin/electron"
if [[ ! -x $electron_bin ]]; then
  printf 'electron not installed — run: cd %s && npm install --save-dev electron\n' "$app_dir" >&2
  exit 1
fi

assets="${FLIP_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/flip}"

single=0
read=0
root=""
while [[ $# -gt 0 ]]; do
  case $1 in
    -s|--single) single=1; shift ;;
    -r|--read) single=1; read=1; shift ;;
    -h|--help) printf 'usage: %s [-s|-r] <directory>\n' "$0"; exit 0 ;;
    -*) printf 'unknown option: %s\n' "$1" >&2; exit 1 ;;
    *) root=$1; shift ;;
  esac
done
if [[ $# -gt 0 ]]; then root=$1; fi

if [[ -z $root || ! -d $root ]]; then
  printf 'usage: %s [-s|-r] <directory>\n' "$0" >&2
  exit 1
fi
root=$(cd -- "$root" && pwd)

tmp=$(mktemp -d "/tmp/flip-electron.XXXXXX")
profile="$tmp/profile"; mkdir -p "$profile"
jsonl="$tmp/comics.jsonl"

image_pred=(
  -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.jfif' -o
  -iname '*.png' -o -iname '*.gif' -o -iname '*.webp' -o
  -iname '*.bmp' -o -iname '*.svg' -o -iname '*.avif'
)

xattr() { getfattr --only-values -n "$2" "$1" 2>/dev/null || true; }

if [[ $single -eq 1 ]]; then
  dirs=( "$root" )
else
  mapfile -d '' -t dirs < <(find "$root" -mindepth 1 -maxdepth 1 -type d ! -name '.*' -print0 | sort -z -V -f)
fi

: > "$jsonl"
i=0
for d in "${dirs[@]}"; do
  title=$(xattr "$d" user.zine.title)
  [[ -n $title ]] || title=$(basename -- "$d")
  author=$(xattr "$d" user.zine.author)
  tags_raw=$(xattr "$d" user.xdg.tags)

  rels=()
  while IFS= read -r -d '' img; do
    rels+=("${img#"$d"/}")
  done < <(find "$d" -mindepth 1 \( -name '.*' -prune \) -o \
    \( -xtype f \( "${image_pred[@]}" \) -print0 \) | sort -z -V -f)

  jq -n \
    --arg id "$i" \
    --arg dir "$d" \
    --arg title "$title" \
    --arg author "$author" \
    --arg tags_raw "$tags_raw" \
    '{id: ($id | tonumber), dir: $dir, title: $title, author: $author,
      tags: ($tags_raw | split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(. != ""))),
      imgs: $ARGS.positional}' \
    --args "${rels[@]}" >> "$jsonl"

  i=$((i + 1))
done

data=$(jq -s '.' "$jsonl" | sed 's/</\\u003c/g') || {
  printf 'failed to build list\n' >&2
  exit 1
}

autoread=false
[[ $read -eq 1 ]] && autoread=true

cp "$assets/viewer.css" "$assets/viewer.js" "$tmp/"
tpl=$(<"$assets/viewer.html")
head=${tpl%%@@DATA@@*}
tail=${tpl#*@@DATA@@}
tail=${tail/@@AUTOREAD@@/$autoread}
{
  printf '%s' "$head"
  printf '%s' "$data"
  printf '%s' "$tail"
} > "$tmp/viewer.html"

FLIP_PROFILE="$profile" "$electron_bin" "$app_dir/main.js" "$tmp/viewer.html"
