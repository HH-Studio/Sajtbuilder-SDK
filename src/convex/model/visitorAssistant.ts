import { v, type Infer } from "convex/values";

import {
  canonicalDocumentMime,
  DOCUMENT_EXTENSIONS,
  DOCUMENT_MIME_TYPES,
} from "../../lib/uploads/documentTypes";

export const MAX_ASSISTANT_SOURCES = 5;
export const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
export const MAX_SOURCE_CHARS = 120_000;
export const MAX_PDF_PAGES = 100;
export const MAX_KNOWLEDGE_CHUNKS = 96;
export const MAX_KNOWLEDGE_CHUNK_CHARS = 1_800;
export const MAX_VISITOR_MESSAGE_CHARS = 1_500;
export const MAX_SESSION_TURNS = 30;
export const EMBEDDING_DIMENSIONS = 1_536;
export const STRONG_VISITOR_ASSISTANT_MATCH_SCORE = 0.68;
export const FALLBACK_VISITOR_ASSISTANT_MATCH_SCORE = 0.35;

/** Keep every strong result. If none exists, retain only the best plausible
 * selected-source match so a short exact-fact query can still reach the model. */
export function selectRelevantVisitorAssistantMatches<T extends { _score: number }>(
  matches: T[],
): T[] {
  const strongMatches = matches.filter(
    (match) =>
      Number.isFinite(match._score) &&
      match._score >= STRONG_VISITOR_ASSISTANT_MATCH_SCORE,
  );
  if (strongMatches.length > 0) return strongMatches;
  const bestMatch = matches[0];
  return bestMatch &&
    Number.isFinite(bestMatch._score) &&
    bestMatch._score >= FALLBACK_VISITOR_ASSISTANT_MATCH_SCORE
    ? [bestMatch]
    : [];
}

// --- Visitor attachments ---------------------------------------------------
// A visitor can attach a photo of the problem ("is this the part you replace?")
// or a document ("here is the quote I got"). Deliberately narrow: an image goes
// through the same vision pre-pass the owner chat uses, a document through the
// same text extractor the knowledge sources use, and everything else is refused
// at the mutation. Nothing here is ever placed into the website - it is untrusted
// visitor input that only ever becomes context for one answer.

export const MAX_ATTACHMENTS_PER_MESSAGE = 3;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
/** How much extracted document text reaches the model. One turn's context, not a
 *  knowledge base: a visitor upload is never embedded or retrieved later. */
export const MAX_ATTACHMENT_TEXT_CHARS = 6_000;
export const MAX_ATTACHMENT_NAME_CHARS = 120;

export const ATTACHMENT_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
] as const;
/** Every document type the product takes, so the widget, the preview composer
 *  and the mutation cannot disagree. The list itself lives in
 *  lib/uploads/documentTypes.ts. A file whose text we cannot get out is not
 *  refused here - the turn answers with "the visitor sent a file we could not
 *  read", which is better than a picker that greys out their menu. */
export const ATTACHMENT_DOCUMENT_MIME_TYPES = DOCUMENT_MIME_TYPES;
export const ATTACHMENT_MIME_TYPES = [
  ...ATTACHMENT_IMAGE_MIME_TYPES,
  ...ATTACHMENT_DOCUMENT_MIME_TYPES,
] as const;

/** The browser `accept` string for the visitor + preview composers. Derived so
 *  the picker and the server allow-list can never drift apart. Extensions are
 *  listed too: a phone reports no type at all for a .md, and a picker that
 *  greys out the file the visitor wants is worse than one that lets the server
 *  refuse it. */
export const ATTACHMENT_ACCEPT = [
  ...ATTACHMENT_MIME_TYPES,
  ...DOCUMENT_EXTENSIONS,
].join(",");

export function isAllowedAttachmentMimeType(value: string): boolean {
  return (ATTACHMENT_MIME_TYPES as readonly string[]).includes(
    value.toLowerCase().trim(),
  );
}

/**
 * What one picked file must be sent and stored as, or null when we do not take
 * it. Images keep the browser's own type; documents get ours, because a .md
 * arrives with an empty type on Safari and a .docx from a share sheet arrives
 * as a zip. The picker and the mutation both go through this, so a file the
 * visitor can choose is a file the server will accept.
 */
export function attachmentMimeType(file: {
  type?: string;
  name?: string;
}): string | null {
  const declared = (file.type ?? "").split(";", 1)[0]!.trim().toLowerCase();
  if (isAttachmentImage(declared)) return declared;
  return canonicalDocumentMime(file);
}

export function isAttachmentImage(value: string): boolean {
  return (ATTACHMENT_IMAGE_MIME_TYPES as readonly string[]).includes(
    value.toLowerCase().trim(),
  );
}

/** Stored on the message row so a replayed conversation still shows what the
 *  visitor sent, without a second read of the attachment table. */
export const messageAttachmentValidator = v.object({
  attachmentId: v.id("visitorAssistantAttachments"),
  name: v.string(),
  mimeType: v.string(),
});

export const assistantPositionValidator = v.union(
  v.literal("left"),
  v.literal("right"),
);
export type AssistantPosition = Infer<typeof assistantPositionValidator>;

/** Draft configuration. Publishing validates the selected sources and freezes
 * a public copy in siteSnapshot before visitors can use it. */
export const visitorAssistantConfigValidator = v.object({
  enabled: v.boolean(),
  greeting: v.optional(v.string()),
  sourceIds: v.optional(v.array(v.id("visitorAssistantSources"))),
  leadCaptureEnabled: v.boolean(),
  position: v.optional(assistantPositionValidator),
  // Owner-controlled because it decides whether strangers can push files into
  // the owner's storage and pay for a vision call. Optional so every website
  // created before attachments shipped reads as off.
  attachmentsEnabled: v.optional(v.boolean()),
});
export type VisitorAssistantConfig = Infer<
  typeof visitorAssistantConfigValidator
>;

/** Public snapshot shape. sourceIds is required (possibly empty) so old draft
 * ambiguity cannot leak into the live assistant. */
export const publishedVisitorAssistantConfigValidator = v.object({
  enabled: v.boolean(),
  greeting: v.optional(v.string()),
  sourceIds: v.array(v.id("visitorAssistantSources")),
  leadCaptureEnabled: v.boolean(),
  position: assistantPositionValidator,
  // Optional in the snapshot too: an older published version predates the
  // field, and a missing value must read as off rather than as "unset, so
  // allow it" - the public upload mutation reads THIS, not the draft.
  attachmentsEnabled: v.optional(v.boolean()),
});
export type PublishedVisitorAssistantConfig = Infer<
  typeof publishedVisitorAssistantConfigValidator
>;
