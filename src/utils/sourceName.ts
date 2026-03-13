export function sourceName(url: string): string {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    const name = host.split('.')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return 'Source';
  }
}
