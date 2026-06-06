export const DEP_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies'] as const;

export function extractVersionFromGitSsh(value: string): string {
  const hashIdx = value.lastIndexOf('#');
  if (hashIdx !== -1) {
    return value.slice(hashIdx + 1).replace(/^v/, '');
  }
  return value.replace(/^[~^]/, '').replace(/^v/, '');
}

export function extractRepoIdFromGitSsh(value: string): string | null {
  const match = value.match(/atypon\/(ui-[\w-]+)\.git/i);
  return match ? match[1] : null;
}

export function buildGitSshDepValue(remoteUrl: string, tag: string): string {
  return `git+ssh://${remoteUrl}#${tag}`;
}

export function isGitSshFormat(value: string): boolean {
  return value.startsWith('git+ssh://') || value.startsWith('git://');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace only the dependency value in raw package.json to preserve indentation and formatting. */
export function replaceDepValueInRawPackageJson(
  raw: string,
  key: string,
  oldValue: string,
  newValue: string
): string {
  const escapedKey = escapeRegex(key);
  const escapedOld = escapeRegex(oldValue);
  const pattern = new RegExp(`("${escapedKey}"\\s*:\\s*")${escapedOld}(")`, 'g');
  const replacementValue = newValue.replace(/\$/g, '$$');
  return raw.replace(pattern, `$1${replacementValue}$2`);
}

export function findDepInPackageJson(
  pkgJson: Record<string, unknown>,
  depKey: string
): { section: typeof DEP_SECTIONS[number]; value: string } | null {
  for (const section of DEP_SECTIONS) {
    const deps = pkgJson[section] as Record<string, string> | undefined;
    if (deps && depKey in deps) {
      return { section, value: deps[depKey] };
    }
  }
  return null;
}
