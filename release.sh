#!/bin/bash
#
# release.sh — Shell version of the release-tool
#
# Auto-detects the standing repo from CWD, resolves its dependency tree,
# and processes each repo in layer order: cherry-pick, bump deps, build, tag, push.
#
# Usage:
#   cd ../ui-core && bash /path/to/release.sh
#   bash release.sh --repo ui-base
#   bash release.sh --repo ui-core --dry-run
#

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE="$(cd "$SCRIPT_DIR/.." && pwd)"
GH_BASE="git@github.com:atypon"
GH_SSH_BASE="git+ssh://git@github.com/atypon"
ARTICLE_REMOTE="$GH_BASE/ui-article.git"

DRY_RUN=false
VERBOSE=false
REPO_OVERRIDE=""
LOG_FILE=""

# Tags created this run, stored as "repo_id=tag repo_id=tag ..."
CREATED_TAGS=""

# ─── Repo graph (bash 3 compatible — parallel arrays) ──────────────────────────
#
#   ui-base (layer 1)
#   ├── ui-core (layer 2, dep: ui-base)
#   │   ├── ui-theme-photo (layer 3, dep: ui-core)
#   │   ├── ui-theme-classic (layer 3, dep: ui-core)
#   │   ├── ui-theme-nextgen (layer 3, dep: ui-core)
#   │   └── ui-products (layer 3, dep: ui-core)
#   └── ui-theme-eureka (layer 2, dep: ui-base)
#   ui-article (layer 0, independent)

REPO_IDS=(    ui-base ui-core ui-theme-photo ui-theme-classic ui-theme-nextgen ui-products ui-theme-eureka ui-article)
REPO_LAYERS=( 1       2       3              3                3                3           2               0)
REPO_DEPS=(   ""      ui-base ui-core        ui-core          ui-core          ui-core     ui-base         "")
REPO_ARTICLE=(no      yes     yes            yes              yes              no          yes             no)

# ─── Color helpers ─────────────────────────────────────────────────────────────

_red()    { printf '\033[0;31m%s\033[0m' "$*"; }
_green()  { printf '\033[0;32m%s\033[0m' "$*"; }
_yellow() { printf '\033[0;33m%s\033[0m' "$*"; }
_cyan()   { printf '\033[0;36m%s\033[0m' "$*"; }
_dim()    { printf '\033[2m%s\033[0m' "$*"; }
_bold()   { printf '\033[1m%s\033[0m' "$*"; }

log_info()  { echo "  $(_green '✓') $*"; log_write "INFO  $*"; }
log_warn()  { echo "  $(_yellow '⚠') $*"; log_write "WARN  $*"; }
log_error() { echo "  $(_red '✗') $*"; log_write "ERROR $*"; }

log_write() {
  if [ -n "$LOG_FILE" ]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$LOG_FILE"
  fi
}

dry_run_skip() {
  echo "  $(_yellow "[DRY-RUN] Would run: $*")"
  log_write "DRY-RUN $*"
}

# ─── Repo graph helpers ───────────────────────────────────────────────────────

repo_index() {
  local target="$1" i=0
  for id in "${REPO_IDS[@]}"; do
    if [ "$id" = "$target" ]; then echo "$i"; return 0; fi
    i=$((i + 1))
  done
  return 1
}

repo_exists() { repo_index "$1" >/dev/null 2>&1; }
repo_layer() { local idx; idx=$(repo_index "$1") && echo "${REPO_LAYERS[$idx]}"; }
repo_dep()   { local idx; idx=$(repo_index "$1") && echo "${REPO_DEPS[$idx]}"; }
repo_article() { local idx; idx=$(repo_index "$1") && echo "${REPO_ARTICLE[$idx]}"; }
repo_path()  { echo "$WORKSPACE/$1"; }
repo_remote() { echo "$GH_BASE/$1.git"; }

detect_standing_repo() {
  local cwd="$1"
  local dirname
  dirname="$(basename "$cwd")"
  for id in "${REPO_IDS[@]}"; do
    if [ "$cwd" = "$(repo_path "$id")" ] || [ "$dirname" = "$id" ]; then
      echo "$id"; return 0
    fi
  done
  return 1
}

# BFS to collect repo + all descendants, sorted by layer (1,2,3,0)
get_descendants() {
  local start="$1"
  local queue="$start"
  local visited=""
  local result=""

  while [ -n "$queue" ]; do
    local current="${queue%% *}"
    if [ "$queue" != "$current" ]; then
      queue="${queue#* }"
    else
      queue=""
    fi

    case " $visited " in *" $current "*) continue ;; esac
    visited="$visited $current"
    result="$result $current"

    for id in "${REPO_IDS[@]}"; do
      local dep
      dep="$(repo_dep "$id")"
      if [ "$dep" = "$current" ]; then
        case " $visited " in *" $id "*) ;; *) queue="$queue $id" ;; esac
      fi
    done
  done

  # Sort by layer: 1, 2, 3, 0
  local sorted=""
  for layer in 1 2 3 0; do
    for id in $result; do
      local rl
      rl="$(repo_layer "$id")"
      if [ "$rl" = "$layer" ]; then
        sorted="$sorted $id"
      fi
    done
  done
  echo "$sorted" | xargs
}

# ─── Tag created tracking (bash 3 compatible) ──────────────────────────────────

record_tag() {
  CREATED_TAGS="$CREATED_TAGS $1=$2"
}

get_created_tags_for() {
  local repo_id="$1" track="$2" result=""
  for entry in $CREATED_TAGS; do
    local eid="${entry%%=*}"
    local etag="${entry#*=}"
    if [ "$eid" = "$repo_id" ]; then
      local track_stripped="${track#v}"
      case "$etag" in v${track_stripped}.*) result="$etag"; ;; esac
    fi
  done
  echo "$result"
}

get_all_created_tags_for() {
  local repo_id="$1" result=""
  for entry in $CREATED_TAGS; do
    local eid="${entry%%=*}"
    local etag="${entry#*=}"
    if [ "$eid" = "$repo_id" ]; then
      result="$result $etag"
    fi
  done
  echo "$result" | xargs
}

# ─── Git/version helpers ──────────────────────────────────────────────────────

get_latest_tag_in_track() {
  local rp="$1" track="$2"
  local ts="${track#v}"
  git -C "$rp" tag -l "v${ts}.*" 2>/dev/null | sort -V | tail -n 1
}

get_latest_remote_tag_in_track() {
  local rp="$1" remote_url="$2" track="$3"
  local ts="${track#v}"
  git -C "$rp" ls-remote --tags "$remote_url" 2>/dev/null \
    | awk '{print $2}' \
    | grep -E "refs/tags/v${ts}\.[0-9]+$" \
    | sed 's|refs/tags/||' \
    | sort -V | tail -n 1
}

get_latest_remote_article_tag() {
  local rp="$1"
  git -C "$rp" ls-remote --tags "$ARTICLE_REMOTE" 2>/dev/null \
    | awk '{print $2}' \
    | grep -E 'refs/tags/v[0-9]+\.[0-9]+\.[0-9]+$' \
    | sed 's|refs/tags/||' \
    | sort -V | tail -n 1
}

increment_tag() {
  local tag="$1"
  local stripped="${tag#v}"
  local major minor patch
  IFS='.' read -r major minor patch <<< "$stripped"
  echo "v${major}.${minor}.$((patch + 1))"
}

extract_version_from_dep() {
  echo "$1" | sed -E 's/.*#(v?[0-9]+\.[0-9]+\.[0-9]+)$/\1/'
}

# ─── Per-repo release flow ─────────────────────────────────────────────────────

process_repo() {
  local repo_id="$1"
  local rp
  rp="$(repo_path "$repo_id")"
  local dep_id
  dep_id="$(repo_dep "$repo_id")"
  local consumes
  consumes="$(repo_article "$repo_id")"
  local stashed=false

  echo ""
  echo "$(_cyan '════════════════════════════════════════════════════════════')"
  echo "  $(_cyan "$(_bold "Processing: $repo_id")")"
  echo "$(_cyan '════════════════════════════════════════════════════════════')"

  if [ ! -d "$rp" ]; then
    log_error "$repo_id: path not found at $rp"
    return 1
  fi

  # Step 0: checkout develop, pull, fetch tags
  if $DRY_RUN; then
    dry_run_skip "git checkout develop"
    dry_run_skip "git pull"
    dry_run_skip "git fetch --tags"
  else
    git -C "$rp" checkout develop 2>/dev/null || log_warn "Could not checkout develop"
    git -C "$rp" pull 2>/dev/null || log_warn "Pull failed"
    git -C "$rp" fetch --tags 2>/dev/null || log_warn "Fetch tags failed"
  fi

  # Step 1: Dirty tree check
  local status_out
  status_out="$(git -C "$rp" status --porcelain 2>/dev/null || true)"
  if [ -n "$status_out" ]; then
    log_warn "Working tree has uncommitted changes:"
    echo "$status_out" | head -20
    echo ""
    echo "    [S] Stash    [P] Proceed    [A] Abort this repo"
    local dirty_choice
    read -rp "  Choose [S/P/A]: " dirty_choice
    case "${dirty_choice}" in
      [sS])
        if $DRY_RUN; then dry_run_skip "git stash"
        else git -C "$rp" stash; log_info "Stashed changes"; stashed=true
        fi ;;
      [pP]) log_warn "Proceeding with dirty tree" ;;
      *)    log_warn "Repo aborted"; return 0 ;;
    esac
  fi

  # Step 2: Select version tracks
  echo ""
  echo "  $(_cyan "Select version tracks for $repo_id")"
  echo "  Available tracks:"

  local all_tags_raw
  all_tags_raw="$(git -C "$rp" tag -l 'v*' 2>/dev/null | sort -V)"
  local seen_tracks=""
  local IFS_BAK="$IFS"

  while IFS= read -r tag; do
    [ -z "$tag" ] && continue
    local stripped="${tag#v}"
    local track_name="v${stripped%.*}"
    case " $seen_tracks " in
      *" $track_name "*) ;;
      *)
        seen_tracks="$seen_tracks $track_name"
        local latest
        latest="$(get_latest_tag_in_track "$rp" "$track_name")"
        echo "    $track_name — latest: $latest"
        ;;
    esac
  done <<< "$all_tags_raw"

  echo ""
  local user_tracks_input
  read -rp "  Enter tracks (space-separated, e.g. 2.7 2.8): " user_tracks_input
  IFS=' ' read -ra user_tracks <<< "$user_tracks_input"

  if [ ${#user_tracks[@]} -eq 0 ]; then
    log_warn "No tracks selected. Skipping $repo_id."
    $stashed && ! $DRY_RUN && { git -C "$rp" stash pop 2>/dev/null || log_warn "Stash pop failed"; }
    return 0
  fi

  # Step 3: Cherry-pick SHAs
  echo ""
  local revisions_input
  read -rp "  Enter commit SHAs to cherry-pick (space-separated, or empty to skip): " revisions_input
  IFS=' ' read -ra revisions <<< "$revisions_input"

  # Step 4: Process each track
  for user_track in "${user_tracks[@]}"; do
    local track="v${user_track#v}"
    echo ""
    echo "  $(_cyan "── Track: $track ──")"

    local latest_patch
    latest_patch="$(get_latest_tag_in_track "$rp" "$track")"
    if [ -z "$latest_patch" ]; then
      log_warn "No existing patches for $track. Starting from ${track}.0"
    else
      echo "  Latest patch: $(_bold "$latest_patch")"
    fi

    local new_tag
    if [ -n "$latest_patch" ]; then
      new_tag="$(increment_tag "$latest_patch")"
    else
      new_tag="${track}.0"
    fi
    echo "  $(_green '→') New tag: $(_green "$(_bold "$new_tag")")"

    # Checkout latest tag
    if [ -n "$latest_patch" ]; then
      if $DRY_RUN; then dry_run_skip "git checkout $latest_patch"
      else
        git -C "$rp" checkout "$latest_patch"
        echo "  $(_dim "Checked out $latest_patch")"
      fi
    fi

    # Bump parent dep
    if [ -n "$dep_id" ]; then
      local parent_tag=""
      parent_tag="$(get_created_tags_for "$dep_id" "$track")"

      if [ -z "$parent_tag" ]; then
        local pr
        pr="$(repo_remote "$dep_id")"
        parent_tag="$(get_latest_remote_tag_in_track "$rp" "$pr" "$track" 2>/dev/null || true)"
        [ -n "$parent_tag" ] && echo "  $(_dim "Using latest remote $parent_tag for $dep_id")"
      fi

      if [ -n "$parent_tag" ]; then
        local dep_value="$GH_SSH_BASE/${dep_id}.git#${parent_tag}"
        if $DRY_RUN; then
          dry_run_skip "Update $dep_id to $dep_value in package.json"
        else
          if command -v jq >/dev/null 2>&1; then
            jq --arg d "$dep_id" --arg v "$dep_value" '.dependencies[$d] = $v' \
              "$rp/package.json" > "$rp/package.json.tmp" && mv "$rp/package.json.tmp" "$rp/package.json"
          else
            sed -i.bak "s|\"$dep_id\": \"[^\"]*\"|\"$dep_id\": \"$dep_value\"|" "$rp/package.json"
            rm -f "$rp/package.json.bak"
          fi
          git -C "$rp" add package.json
          [ -f "$rp/package-lock.json" ] && git -C "$rp" add package-lock.json
          git -C "$rp" commit -m "Update $dep_id to version $parent_tag" --allow-empty
          echo "  $(_green '↑') Bumped $dep_id → $parent_tag"
          log_info "Bumped $dep_id to $parent_tag"
        fi
      else
        log_warn "No tag for $dep_id on $track — skipping dep bump"
      fi
    fi

    # Bump ui-article if consumed
    if [ "$consumes" = "yes" ] && command -v jq >/dev/null 2>&1; then
      local cur_article
      cur_article="$(jq -r '.dependencies["ui-article"] // empty' "$rp/package.json" 2>/dev/null || true)"
      if [ -n "$cur_article" ]; then
        local latest_art=""
        latest_art="$(get_all_created_tags_for "ui-article")"
        [ -n "$latest_art" ] && latest_art="${latest_art##* }"
        [ -z "$latest_art" ] && latest_art="$(get_latest_remote_article_tag "$rp" 2>/dev/null || true)"

        if [ -n "$latest_art" ]; then
          local cur_ver
          cur_ver="$(extract_version_from_dep "$cur_article")"
          if [ "$cur_ver" != "$latest_art" ]; then
            local art_val="$GH_SSH_BASE/ui-article.git#${latest_art}"
            if $DRY_RUN; then
              dry_run_skip "Update ui-article to $latest_art"
            else
              jq --arg v "$art_val" '.dependencies["ui-article"] = $v' \
                "$rp/package.json" > "$rp/package.json.tmp" && mv "$rp/package.json.tmp" "$rp/package.json"
              git -C "$rp" add package.json
              git -C "$rp" commit -m "Upgrade ui-article to $latest_art" --allow-empty
              echo "  $(_green '↑') Bumped ui-article → $latest_art"
              log_info "Bumped ui-article to $latest_art"
            fi
          else
            echo "  $(_dim "ui-article already at $latest_art, skipping")"
          fi
        fi
      fi
    fi

    # Cherry-pick
    if [ ${#revisions[@]} -gt 0 ]; then
      for rev in "${revisions[@]}"; do
        [ -z "$rev" ] && continue
        if $DRY_RUN; then dry_run_skip "git cherry-pick $rev"; continue; fi
        echo "  Cherry-picking: $rev"
        if ! git -C "$rp" cherry-pick "$rev" 2>/dev/null; then
          log_warn "Conflict on $rev"
          echo "  $(_red 'Conflict detected.')"
          echo "  Resolve in your editor, then git add the files."
          while true; do
            local resp
            read -rp "  Press ENTER to continue, or type ABORT: " resp
            if [ "${resp}" = "ABORT" ] || [ "${resp}" = "abort" ]; then
              git -C "$rp" cherry-pick --abort 2>/dev/null || true
              log_warn "Cherry-pick aborted"; break 2
            fi
            git -C "$rp" cherry-pick --skip 2>/dev/null || true
            if git -C "$rp" cherry-pick --continue 2>/dev/null; then
              log_info "Cherry-pick resolved for $rev"; break
            elif git -C "$rp" log --oneline | grep -q "${rev:0:7}"; then
              echo "  $(_dim "Revision $rev already committed. Skipping.")"; break
            else
              echo "  $(_yellow 'Resolution failed. Try again.')"
            fi
          done
        else
          log_info "Cherry-picked $rev"
        fi
      done
    fi

    # npm install
    if $DRY_RUN; then
      dry_run_skip "npm install"
    else
      echo "  Running npm install..."
      while true; do
        if (cd "$rp" && npm install 2>&1); then
          log_info "npm install succeeded"; break
        else
          log_error "npm install failed"
          local ir
          read -rp "  ENTER to retry, ABORT to cancel: " ir
          if [ "$ir" = "ABORT" ] || [ "$ir" = "abort" ]; then log_warn "Install aborted"; return 1; fi
        fi
      done
    fi

    # npm run build
    if $DRY_RUN; then
      dry_run_skip "npm run build"
    else
      echo "  Running npm run build..."
      while true; do
        if (cd "$rp" && npm run build 2>&1); then
          log_info "Build succeeded"; break
        else
          log_error "Build failed"
          local br
          read -rp "  ENTER=retry, SKIP=skip, ABORT=cancel: " br
          case "$br" in
            ABORT|abort) log_warn "Build aborted"; return 1 ;;
            SKIP|skip)   log_warn "Build skipped"; break ;;
          esac
        fi
      done
    fi

    # Diff summary
    local prev_display="${latest_patch:-${track}.0}"
    echo ""
    echo "  $(_cyan '╔══════════════════════════════════════════════════════╗')"
    echo "  $(_cyan '║') $(_bold "DIFF: $repo_id  $prev_display → $new_tag")"
    echo "  $(_cyan '╠══════════════════════════════════════════════════════╣')"
    if [ -n "$latest_patch" ]; then
      echo "  $(_cyan '║') Commits:"
      git -C "$rp" log "${latest_patch}..HEAD" --oneline 2>/dev/null | head -15 | while IFS= read -r line; do
        echo "  $(_cyan '║')   $line"
      done
      local stat_line
      stat_line="$(git -C "$rp" diff --stat "${latest_patch}..HEAD" 2>/dev/null | tail -1)"
      [ -n "$stat_line" ] && echo "  $(_cyan '║') $stat_line"
    fi
    echo "  $(_cyan '║') Tag: $(_green "$new_tag")"
    echo "  $(_cyan '╠══════════════════════════════════════════════════════╣')"
    echo "  $(_cyan '║') [P] Push    [S] Skip    [A] Abort all"
    echo "  $(_cyan '╚══════════════════════════════════════════════════════╝')"

    local pa
    read -rp "  Choose [P/S/A]: " pa
    case "$pa" in
      [sS]) log_warn "Track $track skipped"; git -C "$rp" checkout develop 2>/dev/null || true; continue ;;
      [aA]) log_warn "Abort all"; return 1 ;;
    esac

    # Tag and push
    if $DRY_RUN; then
      dry_run_skip "git tag $new_tag"
      dry_run_skip "git push origin $new_tag"
      dry_run_skip "git tag -d $new_tag"
    else
      git -C "$rp" tag "$new_tag"
      echo "  Created tag: $new_tag"
      git -C "$rp" push origin "$new_tag"
      echo "  Pushed tag: $new_tag"
      log_info "Pushed $new_tag"
      git -C "$rp" tag -d "$new_tag" 2>/dev/null || true
      echo "  $(_dim "Deleted local tag: $new_tag")"
    fi

    record_tag "$repo_id" "$new_tag"

    # Return to develop
    if $DRY_RUN; then dry_run_skip "git checkout develop"
    else git -C "$rp" checkout develop 2>/dev/null || true
    fi

  done

  # Restore stash
  if $stashed && ! $DRY_RUN; then
    git -C "$rp" stash pop 2>/dev/null || log_warn "Stash pop failed — changes still in stash"
  fi

  log_info "$repo_id done"
}

# ─── Main ──────────────────────────────────────────────────────────────────────

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --dry-run) DRY_RUN=true; shift ;;
      --verbose) VERBOSE=true; shift ;;
      --repo)    REPO_OVERRIDE="$2"; shift 2 ;;
      *) echo "Unknown flag: $1"; echo "Usage: release.sh [--dry-run] [--verbose] [--repo <id>]"; exit 1 ;;
    esac
  done
}

main() {
  parse_args "$@"

  local log_dir="$SCRIPT_DIR/release-logs"
  mkdir -p "$log_dir"
  LOG_FILE="$log_dir/release-$(date +%Y%m%d-%H%M%S).log"

  echo ""
  echo "$(_cyan '╔══════════════════════════════════════════╗')"
  echo "$(_cyan '║        Release Management Tool           ║')"
  echo "$(_cyan '╚══════════════════════════════════════════╝')"
  echo ""

  $DRY_RUN && echo "  $(_yellow '⚠  DRY-RUN MODE — no writes will be executed')" && echo ""

  # Detect standing repo
  local standing_repo=""
  if [ -n "$REPO_OVERRIDE" ]; then
    if repo_exists "$REPO_OVERRIDE"; then
      standing_repo="$REPO_OVERRIDE"
    else
      echo "  $(_red "Error: --repo \"$REPO_OVERRIDE\" not a known repo.")"
      echo "  Known: ${REPO_IDS[*]}"
      exit 1
    fi
  else
    standing_repo="$(detect_standing_repo "$(pwd)")" || true
    if [ -z "$standing_repo" ]; then
      echo "  $(_yellow "Could not detect repo from CWD: $(pwd)")"
      echo "  Run from inside a repo dir, or use --repo <id>"
      exit 1
    fi
  fi

  local tree
  tree="$(get_descendants "$standing_repo")"
  local tree_count
  tree_count="$(echo "$tree" | wc -w | xargs)"

  echo "  $(_cyan "$(_bold "Standing repo:") $standing_repo")"
  echo "  $(_cyan "Release tree ($tree_count repos):")"
  echo ""
  for id in $tree; do
    local dep
    dep="$(repo_dep "$id")"
    local dep_display=""
    [ -n "$dep" ] && dep_display=" $(_dim "(depends on: $dep)")"
    if [ "$id" = "$standing_repo" ]; then
      echo "  → $(_bold "$id")$dep_display"
    else
      echo "    $(_bold "$id")$dep_display"
    fi
  done
  echo ""

  # Validate paths
  echo "  Validating repo paths..."
  local all_valid=true
  for id in $tree; do
    local rp
    rp="$(repo_path "$id")"
    if [ -d "$rp" ]; then
      echo "    $(_green '✓') $id: $(_dim "$rp")"
    else
      echo "    $(_red '✗') $id: $(_red "$rp — NOT FOUND")"
      all_valid=false
    fi
  done
  if ! $all_valid; then
    echo ""; echo "  $(_red 'Missing repo paths. Cannot continue.')"; exit 1
  fi

  # Process repos
  for id in $tree; do
    process_repo "$id" || {
      log_warn "Repo $id failed — stopping"
      break
    }

    if [ "$id" = "ui-base" ] || [ "$id" = "ui-core" ]; then
      local ctags
      ctags="$(get_all_created_tags_for "$id")"
      [ -n "$ctags" ] && echo "" && echo "  $(_cyan "All tags processed for $id. Next: update children.")"
    fi
  done

  # Summary
  echo ""
  echo "$(_cyan '═══════════════════════════════════════════')"
  echo "  $(_cyan "$(_bold 'FINAL SUMMARY')")"
  echo "$(_cyan '═══════════════════════════════════════════')"
  echo ""
  for id in $tree; do
    local tags
    tags="$(get_all_created_tags_for "$id")"
    if [ -n "$tags" ]; then
      echo "  $(_green 'SUCCESS') $(_bold "$id")  Tags:$(_green " $tags")"
    else
      echo "  $(_dim 'SKIPPED') $(_bold "$id")"
    fi
  done
  echo ""
  echo "  $(_green '✓  Release run complete.')"
  echo "  Log: $(_dim "$LOG_FILE")"
  echo ""
}

main "$@"
