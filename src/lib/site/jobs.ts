import type { Locale } from "../i18n";

export const CAREERS_SEGMENT = "careers";

export type DraftCareersRoute =
  | { kind: "page"; pageSlug: string }
  | { kind: "careers-index"; pageSlug: typeof CAREERS_SEGMENT }
  | { kind: "job"; pageSlug: string };

/** Keep draft and shared-preview routing aligned with the public careers URLs. */
export function parseDraftCareersRoute(
  path: readonly string[],
): DraftCareersRoute | null {
  if (path[0] !== CAREERS_SEGMENT) {
    return { kind: "page", pageSlug: path[0] ?? "" };
  }
  if (path.length === 1) {
    return { kind: "careers-index", pageSlug: CAREERS_SEGMENT };
  }
  if (path.length === 2 && path[1]) {
    return { kind: "job", pageSlug: path[1] };
  }
  return null;
}

/** A blank careers row is intentional: its typed index header is the content. */
export function isCareersLandingPage(page: {
  slug: string;
  pageType?: string;
}): boolean {
  return page.slug === CAREERS_SEGMENT && page.pageType !== "job";
}

export const JOB_WORKPLACE_TYPES = ["onsite", "hybrid", "remote"] as const;
export type JobWorkplaceType = (typeof JOB_WORKPLACE_TYPES)[number];

export const JOB_EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "temporary",
  "internship",
  "other",
] as const;
export type JobEmploymentType = (typeof JOB_EMPLOYMENT_TYPES)[number];
export const JOB_STATUSES = ["open", "closed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type JobOpeningFields = {
  jobSummary?: string;
  jobDescription?: string;
  jobRequirements?: string[];
  jobLocation?: string;
  jobCountry?: string;
  jobWorkplaceType?: JobWorkplaceType;
  jobEmploymentType?: JobEmploymentType;
  jobHoursText?: string;
  jobSalaryText?: string;
  jobDeadlineAt?: number;
  jobApplyUrl?: string;
  jobStatus?: JobStatus;
  jobPublishedAt?: number;
};

export type JobOpeningView = JobOpeningFields & {
  slug: string;
  title: string;
  jobSummary: string;
  jobDescription: string;
  jobRequirements: string[];
  jobLocation: string;
  jobCountry: string;
  jobWorkplaceType: JobWorkplaceType;
  jobEmploymentType: JobEmploymentType;
  jobApplyUrl: string;
  jobStatus: JobStatus;
};

export type StoredJobOpeningDraft = {
  summary?: string;
  description?: string;
  requirements?: string[];
  location?: string;
  country?: string;
  workplaceType?: JobWorkplaceType;
  employmentType?: JobEmploymentType;
  hoursText?: string;
  salaryText?: string;
  deadlineAt?: number;
  applyUrl?: string;
  status: JobStatus;
  publishedAt?: number;
};

/** Convert the nested draft/snapshot representation at the route boundary. */
export function jobOpeningViewFromPage(page: {
  slug: string;
  title: string;
  job?: StoredJobOpeningDraft;
}): JobOpeningView | null {
  if (!page.job) return null;
  const candidate: JobOpeningFields & { title: string } = {
    title: page.title,
    jobSummary: page.job.summary,
    jobDescription: page.job.description,
    jobRequirements: page.job.requirements,
    jobLocation: page.job.location,
    jobCountry: page.job.country,
    jobWorkplaceType: page.job.workplaceType,
    jobEmploymentType: page.job.employmentType,
    jobHoursText: page.job.hoursText,
    jobSalaryText: page.job.salaryText,
    jobDeadlineAt: page.job.deadlineAt,
    jobApplyUrl: page.job.applyUrl,
    jobStatus: page.job.status,
    jobPublishedAt: page.job.publishedAt,
  };
  if (validateJobOpening(candidate).length > 0) return null;
  return {
    slug: page.slug,
    title: page.title,
    jobSummary: candidate.jobSummary!,
    jobDescription: candidate.jobDescription!,
    jobRequirements: candidate.jobRequirements!,
    jobLocation: candidate.jobLocation!,
    jobCountry: candidate.jobCountry!,
    jobWorkplaceType: candidate.jobWorkplaceType!,
    jobEmploymentType: candidate.jobEmploymentType!,
    jobHoursText: candidate.jobHoursText,
    jobSalaryText: candidate.jobSalaryText,
    jobDeadlineAt: candidate.jobDeadlineAt,
    jobApplyUrl: candidate.jobApplyUrl!,
    jobStatus: candidate.jobStatus!,
    jobPublishedAt: candidate.jobPublishedAt,
  };
}

export const JOB_REQUIREMENTS_MAX = 20;

export type JobOpeningValidationError =
  | "title"
  | "summary"
  | "description"
  | "requirements"
  | "location"
  | "country"
  | "workplace_type"
  | "employment_type"
  | "apply_url"
  | "deadline";

/** Publish validation is deliberately stricter than the partial draft shape. */
export function validateJobOpening(
  job: JobOpeningFields & { title?: string },
): JobOpeningValidationError[] {
  const errors: JobOpeningValidationError[] = [];
  if (!job.title?.trim()) errors.push("title");
  if (!job.jobSummary?.trim()) errors.push("summary");
  if (!job.jobDescription?.trim()) errors.push("description");
  const requirements = (job.jobRequirements ?? []).map((item) => item.trim()).filter(Boolean);
  if (requirements.length === 0 || requirements.length > JOB_REQUIREMENTS_MAX) {
    errors.push("requirements");
  }
  if (!job.jobLocation?.trim()) errors.push("location");
  if (!/^[A-Za-z]{2}$/.test(job.jobCountry ?? "")) errors.push("country");
  if (!job.jobWorkplaceType || !JOB_WORKPLACE_TYPES.includes(job.jobWorkplaceType)) {
    errors.push("workplace_type");
  }
  if (!job.jobEmploymentType || !JOB_EMPLOYMENT_TYPES.includes(job.jobEmploymentType)) {
    errors.push("employment_type");
  }
  if (!safeJobApplyUrl(job.jobApplyUrl)) errors.push("apply_url");
  if (
    job.jobDeadlineAt !== undefined &&
    (!Number.isFinite(job.jobDeadlineAt) || job.jobDeadlineAt < 0)
  ) {
    errors.push("deadline");
  }
  return errors;
}

/** Return the normalized URL only when it is an absolute HTTPS destination. */
export function safeJobApplyUrl(raw?: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || !url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Deadline is an absolute timestamp chosen by the owner. Equality is expired. */
export function isJobOpeningOpen(
  job: JobOpeningFields,
  now = Date.now(),
): boolean {
  return (
    job.jobStatus === "open" &&
    safeJobApplyUrl(job.jobApplyUrl) !== null &&
    (job.jobDeadlineAt === undefined || endOfUtcDay(job.jobDeadlineAt) > now)
  );
}

/** Date-picker values are date-only. Expiry is the end of that UTC calendar day. */
export function endOfUtcDay(ms: number): number {
  const date = new Date(ms);
  if (!Number.isFinite(ms) || Number.isNaN(date.getTime())) return Number.NaN;
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
  );
}

export function openJobs(
  jobs: JobOpeningView[],
  now = Date.now(),
): JobOpeningView[] {
  return jobs
    .filter((job) => isJobOpeningOpen(job, now))
    .sort((a, b) => {
      const deadlineA = a.jobDeadlineAt ?? Number.POSITIVE_INFINITY;
      const deadlineB = b.jobDeadlineAt ?? Number.POSITIVE_INFINITY;
      return deadlineA - deadlineB || a.title.localeCompare(b.title);
    });
}

const EMPLOYMENT_LABELS: Record<JobEmploymentType, Record<Locale, string>> = {
  full_time: { sv: "Heltid", en: "Full time", pl: "Pełny etat" },
  part_time: { sv: "Deltid", en: "Part time", pl: "Niepełny etat" },
  contract: { sv: "Uppdrag", en: "Contract", pl: "Kontrakt" },
  temporary: { sv: "Visstid", en: "Temporary", pl: "Praca tymczasowa" },
  internship: { sv: "Praktik", en: "Internship", pl: "Staż" },
  other: { sv: "Annan", en: "Other", pl: "Inna" },
};

const WORKPLACE_LABELS: Record<JobWorkplaceType, Record<Locale, string>> = {
  onsite: { sv: "På plats", en: "On-site", pl: "Stacjonarnie" },
  hybrid: { sv: "Hybrid", en: "Hybrid", pl: "Hybrydowo" },
  remote: { sv: "På distans", en: "Remote", pl: "Zdalnie" },
};

export function jobEmploymentLabel(
  type: JobEmploymentType | undefined,
  lang: Locale,
): string | null {
  return type ? EMPLOYMENT_LABELS[type][lang] : null;
}

export function jobWorkplaceLabel(
  type: JobWorkplaceType | undefined,
  lang: Locale,
): string | null {
  return type ? WORKPLACE_LABELS[type][lang] : null;
}

export function jobCountryLabel(country: string, lang: Locale): string {
  const code = country.trim().toUpperCase();
  try {
    return new Intl.DisplayNames(
      lang === "sv" ? "sv-SE" : lang === "pl" ? "pl-PL" : "en-US",
      { type: "region" },
    ).of(code) ?? code;
  } catch {
    return code;
  }
}

export function jobLocationLabel(job: JobOpeningFields, lang: Locale): string {
  const country = jobCountryLabel(job.jobCountry ?? "", lang);
  if (job.jobWorkplaceType === "remote") {
    return lang === "sv"
      ? `Distans inom ${country}`
      : lang === "pl"
        ? `Zdalnie na terenie: ${country}`
        : `Remote within ${country}`;
  }
  const location = job.jobLocation?.trim();
  return location ? `${location}, ${country}` : country;
}

export function careersLabels(lang: Locale) {
  return lang === "sv"
    ? {
        index: "Lediga jobb",
        empty: "Vi har inga lediga jobb just nu.",
        apply: "Ansök externt",
        applyNote: "Du lämnar webbplatsen för att ansöka.",
        back: "Alla lediga jobb",
        requirements: "Krav",
        deadline: "Sista ansökningsdag",
        closed: "Tjänsten är inte längre öppen för ansökningar.",
      }
    : lang === "pl"
      ? {
          index: "Oferty pracy",
          empty: "Obecnie nie mamy otwartych rekrutacji.",
          apply: "Aplikuj zewnętrznie",
          applyNote: "Opuścisz tę stronę, aby złożyć aplikację.",
          back: "Wszystkie oferty pracy",
          requirements: "Wymagania",
          deadline: "Termin składania aplikacji",
          closed: "Ta oferta nie przyjmuje już aplikacji.",
        }
      : {
          index: "Careers",
          empty: "We have no open roles right now.",
          apply: "Apply externally",
          applyNote: "You’ll leave this website to apply.",
          back: "All open roles",
          requirements: "Requirements",
          deadline: "Application deadline",
          closed: "This role is no longer accepting applications.",
        };
}

export function formatJobDeadline(ms: number, lang: Locale): string {
  return new Intl.DateTimeFormat(
    lang === "sv" ? "sv-SE" : lang === "pl" ? "pl-PL" : "en-US",
    { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" },
  ).format(new Date(ms));
}
