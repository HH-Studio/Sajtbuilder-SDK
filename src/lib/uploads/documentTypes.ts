// ---------------------------------------------------------------------------
// Which document files the product takes, in ONE place.
//
// A document is any file an owner or a visitor hands us that can become a
// download on the finished site, and that we READ for text when we are able to.
// Until 2026-08-18 that meant one thing, PDF, and the word "pdf" was written
// into eleven surfaces: the prompt box, the wizard, the archive unpacker, the
// documents section, the visitor assistant's knowledge sources and its chat
// attachments, plus each one's server twin. A menu written in Word bounced off
// every one of them, which is the file a small business is most likely to have.
//
// So: one table. A surface asks this file what it may accept, what to store the
// blob as, and how to read it back. Adding a type is one row here plus one
// branch in convex/lib/documents/text.ts, and every surface follows.
//
// Four rules the table encodes, all learned the hard way:
//
//  1. The browser's `File.type` is a hint, not the truth. A phone share sheet
//     routinely reports `application/octet-stream`, a .md file often arrives
//     with an empty type, and EVERY modern office format (docx, xlsx, odt,
//     pages) is really a zip. So classification falls back to the file
//     EXTENSION, and the canonical MIME we store is ours, never the browser's.
//  2. What we accept must be what the next step accepts. The landing composer
//     accepting a file the wizard refuses is a real incident in this repo (see
//     lib/anon/pendingImages.ts), so the server allow-lists read from here too.
//  3. Not being able to READ a file is not a reason to refuse it (owner
//     directive 2026-08-18). A brochure we cannot parse still belongs on the
//     owner's website as a download; what we owe them is a plain sentence
//     saying we could not read the text, not a closed door. Every type below
//     has a reader today, so that case is reached at RUNTIME rather than by
//     type - a scanned PDF, a .pages saved without its preview, an empty
//     document - and the caller keeps the file either way.
//  4. Apple's formats are readable without an Apple parser. A .pages, .numbers
//     or .key file is a zip that normally carries a rendered `Preview.pdf`
//     inside it, so we read that. Normally, not always: a file exported from
//     iCloud can omit it, and then the file is store-only like any other.
// ---------------------------------------------------------------------------

export type DocumentFileType =
  | "pdf"
  | "docx"
  | "doc"
  | "rtf"
  | "odt"
  | "txt"
  | "md"
  | "csv"
  | "xlsx"
  | "ods"
  | "pptx"
  | "pages"
  | "numbers"
  | "key";

/** How the bytes are turned into text. Each value is one branch in
 *  convex/lib/documents/text.ts. `null` is for a format we would accept as a
 *  download but cannot read at all; nothing in the table uses it today, and it
 *  exists so that adding such a format is a one-line change rather than a new
 *  concept. */
export type DocumentReader =
  | "pdf"
  | "text"
  | "docx"
  | "doc"
  | "rtf"
  /** ODF: unzip, read `content.xml`. Covers .odt and .ods. */
  | "opendocument"
  /** OOXML spreadsheet: unzip, join each row's cells so "Klippning 450" stays
   *  one line instead of becoming a word list and a number list. */
  | "xlsx"
  /** OOXML slides: unzip, read every `<a:t>` run. */
  | "pptx"
  /** iWork: unzip, read the `Preview.pdf` Pages/Numbers/Keynote embeds. */
  | "iwork"
  | null;

/** What a file's first bytes must look like. The import path checks this; the
 *  upload path does not need to, because it stores what the picker gave it. */
export type DocumentShape = "pdf" | "zip" | "ole" | "rtf" | "text";

type DocumentSpec = {
  /** What we store the blob as, and what every allow-list checks against. */
  mime: string;
  /** Other MIME types a browser may report for the same file. Never stored. */
  alsoAccepts: readonly string[];
  /** Lower-case, with the dot. First entry is the canonical one. */
  extensions: readonly string[];
  /** Short plain word for the owner, not a MIME type. */
  label: string;
  reader: DocumentReader;
  shape: DocumentShape;
};

const ZIP_ALTERNATES = ["application/zip", "application/x-zip-compressed"] as const;

export const DOCUMENT_TYPES: Record<DocumentFileType, DocumentSpec> = {
  pdf: {
    mime: "application/pdf",
    alsoAccepts: ["application/x-pdf"],
    extensions: [".pdf"],
    label: "PDF",
    reader: "pdf",
    shape: "pdf",
  },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    alsoAccepts: ZIP_ALTERNATES,
    extensions: [".docx"],
    label: "Word",
    reader: "docx",
    shape: "zip",
  },
  doc: {
    // Word 97-2003. Still what an older firm's computer produces, and a
    // different container entirely from .docx - hence its own reader.
    mime: "application/msword",
    alsoAccepts: [],
    extensions: [".doc"],
    label: "Word",
    reader: "doc",
    shape: "ole",
  },
  rtf: {
    mime: "application/rtf",
    alsoAccepts: ["text/rtf"],
    extensions: [".rtf"],
    label: "RTF",
    reader: "rtf",
    shape: "rtf",
  },
  odt: {
    mime: "application/vnd.oasis.opendocument.text",
    alsoAccepts: ZIP_ALTERNATES,
    extensions: [".odt"],
    label: "LibreOffice",
    reader: "opendocument",
    shape: "zip",
  },
  ods: {
    mime: "application/vnd.oasis.opendocument.spreadsheet",
    alsoAccepts: ZIP_ALTERNATES,
    extensions: [".ods"],
    label: "LibreOffice",
    reader: "opendocument",
    shape: "zip",
  },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    alsoAccepts: ZIP_ALTERNATES,
    extensions: [".xlsx"],
    label: "Excel",
    reader: "xlsx",
    shape: "zip",
  },
  pptx: {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    alsoAccepts: ZIP_ALTERNATES,
    extensions: [".pptx"],
    label: "PowerPoint",
    reader: "pptx",
    shape: "zip",
  },
  pages: {
    mime: "application/x-iwork-pages-sffpages",
    alsoAccepts: ZIP_ALTERNATES,
    extensions: [".pages"],
    label: "Pages",
    reader: "iwork",
    shape: "zip",
  },
  numbers: {
    mime: "application/x-iwork-numbers-sffnumbers",
    alsoAccepts: ZIP_ALTERNATES,
    extensions: [".numbers"],
    label: "Numbers",
    reader: "iwork",
    shape: "zip",
  },
  key: {
    mime: "application/x-iwork-keynote-sffkey",
    alsoAccepts: ZIP_ALTERNATES,
    extensions: [".key"],
    label: "Keynote",
    reader: "iwork",
    shape: "zip",
  },
  txt: {
    mime: "text/plain",
    alsoAccepts: [],
    extensions: [".txt"],
    label: "Text",
    reader: "text",
    shape: "text",
  },
  md: {
    mime: "text/markdown",
    // Browsers disagree about markdown: some say text/markdown, some
    // text/x-markdown, many say text/plain, and Safari often says nothing.
    alsoAccepts: ["text/x-markdown", "text/plain"],
    extensions: [".md", ".markdown"],
    label: "Markdown",
    reader: "text",
    shape: "text",
  },
  csv: {
    mime: "text/csv",
    alsoAccepts: ["application/csv", "text/plain"],
    extensions: [".csv"],
    label: "CSV",
    reader: "text",
    shape: "text",
  },
};

const ALL_TYPES = Object.keys(DOCUMENT_TYPES) as DocumentFileType[];

/** Types whose MIME may be matched without an extension to back it up. A zip
 *  container type is shared by half the table, so it can never identify one on
 *  its own - the extension has to. */
const MIME_ONLY_SAFE = ALL_TYPES.filter(
  (type) => DOCUMENT_TYPES[type].shape !== "zip",
);

/** Every MIME type that may be STORED. An allow-list checks against this, never
 *  against what the browser claimed. */
export const DOCUMENT_MIME_TYPES: readonly string[] = ALL_TYPES.map(
  (type) => DOCUMENT_TYPES[type].mime,
);

/** Every extension we understand, dot included. */
export const DOCUMENT_EXTENSIONS: readonly string[] = ALL_TYPES.flatMap(
  (type) => DOCUMENT_TYPES[type].extensions,
);

/** The `accept` attribute for a file input that takes documents. Extensions sit
 *  alongside MIME types because a phone reports neither reliably on its own. */
export const DOCUMENT_FILE_ACCEPT = [
  ...DOCUMENT_MIME_TYPES,
  ...DOCUMENT_EXTENSIONS,
].join(",");

function normalizeMime(value: string | undefined | null): string {
  return (value ?? "").split(";", 1)[0]!.trim().toLowerCase();
}

function extensionOf(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot === -1 ? "" : lower.slice(dot);
}

/**
 * Which document this file is, or null when it is not one.
 *
 * Extension wins over MIME, deliberately. The extension is what the owner typed
 * or what the tool that wrote the file chose; the MIME is what an operating
 * system guessed on the way to us, and it guesses `application/octet-stream`
 * for anything it does not recognise - or `application/zip` for every office
 * format there is. Only when the extension says nothing do we fall back to the
 * reported type, and then only for the types a MIME can actually identify.
 */
export function documentTypeFromFile(file: {
  type?: string;
  name?: string;
}): DocumentFileType | null {
  const ext = extensionOf(file.name ?? "");
  if (ext) {
    const byExtension = ALL_TYPES.find((type) =>
      DOCUMENT_TYPES[type].extensions.includes(ext),
    );
    if (byExtension) return byExtension;
  }
  const mime = normalizeMime(file.type);
  if (!mime) return null;
  const exact = ALL_TYPES.find((type) => DOCUMENT_TYPES[type].mime === mime);
  if (exact) return exact;
  // Alternates only get a look once the extension has said nothing, and never
  // for a zip-shaped format: a zip with no .docx on the end is an archive.
  return (
    MIME_ONLY_SAFE.find((type) =>
      DOCUMENT_TYPES[type].alsoAccepts.includes(mime),
    ) ?? null
  );
}

/** What to send as `Content-Type` when uploading this file, and what the server
 *  will store. Null when the file is not a document we take. */
export function canonicalDocumentMime(file: {
  type?: string;
  name?: string;
}): string | null {
  const type = documentTypeFromFile(file);
  return type ? DOCUMENT_TYPES[type].mime : null;
}

/** True for a MIME type an asset row, a source row or an attachment may carry.
 *  The server's own allow-list; never called with a browser-reported value. */
export function isAllowedDocumentMime(value: string): boolean {
  const mime = normalizeMime(value);
  if (DOCUMENT_MIME_TYPES.includes(mime)) return true;
  // Alternates are accepted on the way IN so an older client that sent
  // `text/x-markdown` is not refused; the row still records the canonical one.
  // The bare zip types are not among them - they identify nothing.
  return MIME_ONLY_SAFE.some((type) =>
    DOCUMENT_TYPES[type].alsoAccepts.includes(mime),
  );
}

/** The stored MIME for a value that passed `isAllowedDocumentMime`, so two rows
 *  describing the same kind of file never disagree. Falls back to the value
 *  itself, which only happens for a type the caller already checked. */
export function canonicalMimeFor(value: string): string {
  const type = documentTypeFromMime(value);
  return type ? DOCUMENT_TYPES[type].mime : normalizeMime(value);
}

/** The type behind a stored MIME, for anything that must READ the bytes. */
export function documentTypeFromMime(value: string): DocumentFileType | null {
  const mime = normalizeMime(value);
  return (
    ALL_TYPES.find((type) => DOCUMENT_TYPES[type].mime === mime) ??
    MIME_ONLY_SAFE.find((type) =>
      DOCUMENT_TYPES[type].alsoAccepts.includes(mime),
    ) ??
    null
  );
}

/** How to read this file, or null when we can only keep it as a download. */
export function documentReaderFor(value: string): DocumentReader {
  const type = documentTypeFromMime(value);
  return type ? DOCUMENT_TYPES[type].reader : null;
}

/**
 * True when this format has a reader at all.
 *
 * Note what it does NOT tell you: whether this particular file will yield
 * anything. A scanned PDF and a .pages saved without its preview are both
 * readable formats that return nothing, so the honest check is always the
 * extraction result, and every caller keeps the file either way.
 */
export function isReadableDocument(value: string): boolean {
  return documentReaderFor(value) !== null;
}

/** What a file of this type must start with, for the import path's byte check. */
export function documentShapeFor(value: string): DocumentShape | null {
  const type = documentTypeFromMime(value);
  return type ? DOCUMENT_TYPES[type].shape : null;
}

/** The owner-facing word for a file, from its stored MIME. Used on rows that
 *  show what was attached. Falls back to "Fil"/"File" wording at the call site,
 *  which owns the language. */
export function documentLabelFromMime(value: string): string | null {
  const type = documentTypeFromMime(value);
  return type ? DOCUMENT_TYPES[type].label : null;
}

/** Strip a known document extension off a filename, for a default title. */
export function stripDocumentExtension(name: string): string {
  const ext = extensionOf(name);
  return DOCUMENT_EXTENSIONS.includes(ext) ? name.slice(0, -ext.length) : name;
}
