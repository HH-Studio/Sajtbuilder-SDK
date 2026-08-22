// ---------------------------------------------------------------------------
// Reading the agency's Sanity Studio schema STATICALLY.
//
// The export tells you a document has a field called `body`. Only the schema
// tells you it is Portable Text with three custom block types in it. That is
// the single fact that shapes this whole importer, and it is why the CLI takes
// two inputs instead of one.
//
// **Statically means read, never execute.** A schema file is TypeScript in the
// agency's repo: it imports their own React components, their own helpers, and
// whatever else the studio needs. Importing it would run all of that, which is
// exactly the thing the project rule forbids in an editable import lane. So
// this reads the file as TEXT and matches the shapes `defineType` /
// `defineField` produce.
//
// A regex reader is honestly worse than a parser at understanding arbitrary
// TypeScript, and that is fine here, because it never has to be right - it has
// to be HONEST. Anything it cannot classify becomes `unknown`, which the
// mapping proposal turns into an explicit `skip` for a human to correct.
// Guessing is the failure mode; admitting is the design.
// ---------------------------------------------------------------------------

import {
  SANITY_EXPORT_LIMITS,
  type SanityFieldKind,
  type SanitySchemaField,
  type SanitySchemaType,
} from "./model";

/** `type: "x"` in a Sanity schema -> what we can say about it. Anything not
 *  here is a custom object type, reported as `object` so the proposal can name
 *  it rather than silently dropping the field. */
const KIND_BY_SANITY_TYPE: Readonly<Record<string, SanityFieldKind>> = {
  string: "string",
  text: "text",
  number: "number",
  boolean: "boolean",
  date: "date",
  datetime: "datetime",
  slug: "slug",
  url: "url",
  image: "image",
  file: "file",
  reference: "reference",
  crossDatasetReference: "reference",
  array: "array",
  object: "object",
  blockContent: "portableText",
};

/** Strip comments and string bodies down to a placeholder before the brace
 *  counter runs, so a `{` inside a comment or a label cannot end a block early.
 *  Positions are preserved (every removed character becomes a space) so an
 *  offset found here still points at the right place in the original. */
function maskLiterals(source: string): string {
  const out = source.split("");
  let i = 0;
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to && k < out.length; k += 1) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === "//") {
      const end = source.indexOf("\n", i);
      blank(i, end === -1 ? source.length : end);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (two === "/*") {
      const end = source.indexOf("*/", i + 2);
      blank(i, end === -1 ? source.length : end + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    const quote = source[i];
    if (quote === '"' || quote === "'" || quote === "`") {
      let k = i + 1;
      while (k < source.length) {
        if (source[k] === "\\") {
          k += 2;
          continue;
        }
        if (source[k] === quote) break;
        k += 1;
      }
      // The quotes stay, so a value reader can still find the string; only its
      // BODY is blanked for the brace counter.
      blank(i + 1, k);
      i = k + 1;
      continue;
    }
    i += 1;
  }
  return out.join("");
}

/** The text between the braces of the object literal that starts at or after
 *  `from`, counted on the masked source so nested braces are honoured. */
function objectBodyAt(
  source: string,
  masked: string,
  from: number,
): { body: string; end: number } | null {
  const open = masked.indexOf("{", from);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < masked.length; i += 1) {
    if (masked[i] === "{") depth += 1;
    else if (masked[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        return { body: source.slice(open + 1, i), end: i + 1 };
      }
    }
  }
  return null;
}

/** `name: "hero"` / `name: 'hero'` at the TOP level of this object body. */
function topLevelString(body: string, key: string): string | undefined {
  const masked = maskLiterals(body);
  let depth = 0;
  for (let i = 0; i < masked.length; i += 1) {
    const ch = masked[i];
    if (ch === "{" || ch === "[" || ch === "(") depth += 1;
    else if (ch === "}" || ch === "]" || ch === ")") depth -= 1;
    else if (depth === 0 && masked.startsWith(key, i)) {
      const after = masked.slice(i + key.length);
      const match = /^\s*:\s*(["'])/.exec(after);
      if (!match) continue;
      const start = i + key.length + match[0].length;
      const quote = match[1];
      const end = body.indexOf(quote, start);
      if (end === -1) continue;
      // A property whose name merely ENDS with the key (`typeName:`) is not
      // the key. Check the character before it.
      const before = i === 0 ? "" : masked[i - 1];
      if (before && /[A-Za-z0-9_$]/.test(before)) continue;
      return body.slice(start, end);
    }
  }
  return undefined;
}

/** The top-level array body for `key: [...]`, or null. */
function topLevelArray(body: string, key: string): string | null {
  const masked = maskLiterals(body);
  let depth = 0;
  for (let i = 0; i < masked.length; i += 1) {
    const ch = masked[i];
    if (ch === "{" || ch === "(") depth += 1;
    else if (ch === "}" || ch === ")") depth -= 1;
    else if (ch === "[") {
      if (depth !== 0) {
        depth += 1;
        continue;
      }
      const before = masked.slice(0, i);
      const label = /([A-Za-z0-9_$]+)\s*:\s*$/.exec(before);
      if (label?.[1] !== key) {
        depth += 1;
        continue;
      }
      let inner = 0;
      for (let k = i; k < masked.length; k += 1) {
        if (masked[k] === "[") inner += 1;
        else if (masked[k] === "]") {
          inner -= 1;
          if (inner === 0) return body.slice(i + 1, k);
        }
      }
      return null;
    } else if (ch === "]") depth -= 1;
  }
  return null;
}

/** Split an array body into its top-level entries. */
function splitEntries(body: string): string[] {
  const masked = maskLiterals(body);
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < masked.length; i += 1) {
    const ch = masked[i];
    if (ch === "{" || ch === "[" || ch === "(") depth += 1;
    else if (ch === "}" || ch === "]" || ch === ")") depth -= 1;
    else if (ch === "," && depth === 0) {
      const entry = body.slice(start, i).trim();
      if (entry) out.push(entry);
      start = i + 1;
    }
  }
  const last = body.slice(start).trim();
  if (last) out.push(last);
  return out;
}

/** Every `"…"` / `'…'` inside a fragment, in order. */
function stringsIn(fragment: string): string[] {
  const out: string[] = [];
  const re = /(["'])((?:\\.|(?!\1)[^\\])*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment))) out.push(m[2]);
  return out;
}

/** One entry of a `fields: [...]` array. */
function readField(entry: string): SanitySchemaField | null {
  const name = topLevelString(entry, "name");
  if (!name) return null;
  const declared = topLevelString(entry, "type") ?? "";
  let kind: SanityFieldKind = KIND_BY_SANITY_TYPE[declared] ?? "unknown";
  if (!declared) kind = "unknown";
  else if (!(declared in KIND_BY_SANITY_TYPE)) {
    // A custom type name. It is an object of the agency's own, and the
    // proposal names it rather than guessing what it holds.
    kind = "object";
  }

  const field: SanitySchemaField = { name, kind };
  const title = topLevelString(entry, "title");
  if (title) field.title = title;

  if (declared === "reference" || declared === "crossDatasetReference") {
    const to = topLevelArray(entry, "to");
    if (to) {
      const targets = splitEntries(to)
        .map((member) => topLevelString(member, "type") ?? stringsIn(member)[0])
        .filter((value): value is string => !!value);
      if (targets.length > 0) field.to = targets;
    }
  }

  if (declared === "array") {
    const of = topLevelArray(entry, "of");
    if (of) {
      const members = splitEntries(of)
        .map((member) => topLevelString(member, "type") ?? stringsIn(member)[0])
        .filter((value): value is string => !!value);
      if (members.length > 0) field.of = members;
      // An array of `block` IS Portable Text. This is the one inference in
      // this file that is worth making, because it is the single commonest
      // field in any Sanity dataset and it is unambiguous.
      if (members.includes("block")) field.kind = "portableText";
    }
  }

  if (declared === "string" || declared === "number") {
    const options = topLevelArray(entry, "list");
    if (options) {
      const values = splitEntries(options).map(
        (member) => topLevelString(member, "value") ?? stringsIn(member)[0] ?? "",
      );
      const usable = values.filter((value) => value.length > 0);
      if (usable.length > 0) field.options = usable;
    }
  }

  // `validation: (Rule) => Rule.required()`. Read as a hint only: a required
  // field the client cannot fill in is worse than an optional one they can, so
  // the mapping proposal never turns this into a required SnabbSajt field on
  // its own.
  if (/\.required\s*\(/.test(entry)) field.required = true;
  return field;
}

/** Read every `defineType` / `createSchema`-style type in one file's TEXT. */
export function readSchemaFile(source: string, file: string): SanitySchemaType[] {
  if (source.length > SANITY_EXPORT_LIMITS.maxSchemaFileBytes) return [];
  const masked = maskLiterals(source);
  const types: SanitySchemaType[] = [];
  // `defineType({…})` is the modern spelling; a bare object literal with
  // `name`, `type: "document"` and `fields` is the older one, and both appear
  // in real repos. The second is matched by looking for `type: "document"`
  // anywhere and walking out to its enclosing object, which is more work than
  // it is worth - so only the explicit callers are read, and a file with
  // neither is reported as carrying no types rather than silently ignored.
  const re = /\b(defineType|defineField)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    if (m[1] !== "defineType") continue;
    const object = objectBodyAt(source, masked, m.index + m[0].length - 1);
    if (!object) continue;
    re.lastIndex = object.end;
    const name = topLevelString(object.body, "name");
    if (!name) continue;
    const declared = topLevelString(object.body, "type") ?? "";
    const kind: SanitySchemaType["type"] =
      declared === "document" ? "document" : declared === "object" ? "object" : "other";
    const fieldsBody = topLevelArray(object.body, "fields");
    const fields = fieldsBody
      ? splitEntries(fieldsBody)
          .map(readField)
          .filter((field): field is SanitySchemaField => field !== null)
      : [];
    const title = topLevelString(object.body, "title");
    types.push({ name, type: kind, fields, file, ...(title ? { title } : {}) });
  }
  return types;
}

/** Read a whole schema directory that has already been loaded into memory.
 *
 *  Takes the files rather than a path so the pure mapper stays testable and
 *  filesystem-free; the CLI does the bounded reading. */
export function readSchemaFiles(
  files: readonly { path: string; source: string }[],
): SanitySchemaType[] {
  const out: SanitySchemaType[] = [];
  for (const file of files.slice(0, SANITY_EXPORT_LIMITS.maxSchemaFiles)) {
    out.push(...readSchemaFile(file.source, file.path));
  }
  return out;
}
