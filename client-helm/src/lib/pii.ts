export function maskWithSuffix(value: string | null | undefined, suffixLen = 4): string {
  if (!value) return "••••";
  const suffix = value.slice(-suffixLen);
  return `•••••• ${suffix}`;
}
