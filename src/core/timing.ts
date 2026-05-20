export function sleep(min: number, max?: number): Promise<void> {
  const ms = max === undefined ? min : min + Math.random() * (max - min);
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function selectAllShortcut(
  platform: NodeJS.Platform = process.platform,
): 'Control+A' | 'Meta+A' {
  return platform === 'darwin' ? 'Meta+A' : 'Control+A';
}
