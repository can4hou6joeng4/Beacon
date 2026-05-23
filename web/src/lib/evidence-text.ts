const FIELD_BOUNDARY = "\n"

export function cleanEvidenceText(text: string | null | undefined): string {
  if (!text) return ""
  return decodeHtmlEntities(text)
    .replace(/<\s*br\s*\/?\s*>/gi, FIELD_BOUNDARY)
    .replace(/<\s*\/\s*(?:tr|table|p|div|section|article|li|h[1-6])\s*>/gi, FIELD_BOUNDARY)
    .replace(/<\s*tr\b[^>]*>/gi, FIELD_BOUNDARY)
    .replace(/<\s*\/\s*t[dh]\s*>/gi, " ")
    .replace(/<\s*t[dh]\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "[图片]")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, "")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "· ")
    .replace(/[ \t]*\|[ \t]*/g, " | ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function evidenceLines(text: string | null | undefined): string[] {
  return cleanEvidenceText(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}
