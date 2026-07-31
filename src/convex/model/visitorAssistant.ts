import { v, type Infer } from "convex/values";

export const MAX_ASSISTANT_SOURCES = 5;
export const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
export const MAX_SOURCE_CHARS = 120_000;
export const MAX_PDF_PAGES = 100;
export const MAX_KNOWLEDGE_CHUNKS = 96;
export const MAX_KNOWLEDGE_CHUNK_CHARS = 1_800;
export const MAX_VISITOR_MESSAGE_CHARS = 1_500;
export const MAX_SESSION_TURNS = 30;
export const EMBEDDING_DIMENSIONS = 1_536;

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
});
export type PublishedVisitorAssistantConfig = Infer<
  typeof publishedVisitorAssistantConfigValidator
>;
