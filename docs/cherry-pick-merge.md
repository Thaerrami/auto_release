# Why `-m 1` when cherry-picking (e.g. in ui-base)

When you cherry-pick a **merge commit**, Git needs to know which parent to use as the "mainline." Otherwise you get:

```text
error: Commit abc123 is a merge but no -m option was given.
fatal: cherry-pick failed
```

Using **`git cherry-pick -m 1 <sha>`** tells Git: use **parent 1** as the mainline when replaying the merge.

## What’s a merge commit?

A merge commit has **two parents**:

- **Parent 1** — usually the branch you had checked out when you ran `git merge` (e.g. `develop` or `main`).
- **Parent 2** — the branch that was merged in (e.g. a feature or fix branch).

So when a fix lands as “Merge branch 'fix/xyz' into develop”, the SHA of that merge has two parents. If you cherry-pick that SHA without `-m`, Git doesn’t know which diff to replay.

## What does `-m 1` do?

- **`-m 1`** — “Use parent 1 as the mainline.” Git replays the **changes introduced by the merge** (the diff from parent 2 to the merge commit) onto your current branch. That’s usually what you want when backporting a fix from develop to a release tag.
- **`-m 2`** — Would use parent 2 as the mainline (less common for this workflow).

So you need **`-m 1`** whenever the SHA you’re cherry-picking **is a merge commit**.

## Why it shows up with ui-base (and others)

Repos like **ui-base** often have merge commits in history because:

- Features/fixes are merged into `develop` (e.g. “Merge branch 'feature/foo' into develop”).
- Release branches are merged back.
- You’re copying a fix from develop onto a release track; the fix might be the merge commit itself.

When that SHA is a merge, cherry-pick without `-m` fails. So “sometimes” you need **`-m 1`** — exactly when the SHA is a merge commit.

## What the release tool does

- **Node tool** — Detects merge commits (two parents) and runs **`git cherry-pick -m 1 <sha>`** automatically for those SHAs. You’ll see: `Cherry-picking merge commit: <sha> (using -m 1)`.
- **Shell script (`release.sh`)** — Does the same: checks `rev^2`; if it exists, runs `cherry-pick -m 1 $rev`, otherwise `cherry-pick $rev`.

You don’t need to remember `-m 1` when using the tool; it’s applied when the commit is a merge.

## Manual cherry-pick

If you run Git yourself (outside the tool):

```bash
# Check if the commit is a merge (second parent exists)
git rev-parse -q --verify <sha>^2

# If it succeeds, use -m 1
git cherry-pick -m 1 <sha>
```
