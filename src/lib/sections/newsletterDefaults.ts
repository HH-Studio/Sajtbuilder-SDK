export type NewsletterSignup = {
  heading: string;
  description: string;
  placeholder: string;
  submitLabel: string;
  successMessage: string;
  consentText?: string;
};

/** Shared seed for the newsletter section and footer layouts that embed the
 * same real signup flow. Keeping it here prevents their default copy drifting. */
const DEFAULTS: Record<SiteLocale, NewsletterSignup> = {
  sv: {
    heading: "Håll dig uppdaterad",
    description: "Få nyheter och erbjudanden då och då. Inget spam.",
    placeholder: "Din e-post",
    submitLabel: "Prenumerera",
    successMessage: "Tack! Du är anmäld.",
  },
  en: {
    heading: "Stay in the loop",
    description: "Get news and offers now and then. No spam.",
    placeholder: "Your email",
    submitLabel: "Subscribe",
    successMessage: "Thanks! You’re signed up.",
  },
  pl: {
    heading: "Bądź na bieżąco",
    description: "Otrzymuj nowości i oferty od czasu do czasu. Żadnego spamu.",
    placeholder: "Twój e-mail",
    submitLabel: "Zapisz się",
    successMessage: "Dziękujemy! Zapisano Cię.",
  },
  de: {
    heading: "Bleiben Sie auf dem Laufenden",
    description:
      "Erhalten Sie gelegentlich Neuigkeiten und Angebote. Kein Spam.",
    placeholder: "Ihre E-Mail-Adresse",
    submitLabel: "Anmelden",
    successMessage: "Danke! Sie sind angemeldet.",
  },
  da: {
    heading: "Hold dig opdateret",
    description: "Få nyheder og tilbud en gang imellem. Ingen spam.",
    placeholder: "Din e-mail",
    submitLabel: "Tilmeld",
    successMessage: "Tak! Du er tilmeldt.",
  },
  no: {
    heading: "Hold deg oppdatert",
    description: "Få nyheter og tilbud av og til. Ingen spam.",
    placeholder: "Din e-post",
    submitLabel: "Abonner",
    successMessage: "Takk! Du er påmeldt.",
  },
  fi: {
    heading: "Pysy ajan tasalla",
    description: "Saat uutisia ja tarjouksia silloin tällöin. Ei roskapostia.",
    placeholder: "Sähköpostiosoitteesi",
    submitLabel: "Tilaa",
    successMessage: "Kiitos! Olet nyt tilaaja.",
  },
  fr: {
    heading: "Restez informé",
    description:
      "Recevez de temps en temps nos actualités et offres. Aucun spam.",
    placeholder: "Votre e-mail",
    submitLabel: "S’inscrire",
    successMessage: "Merci ! Votre inscription est confirmée.",
  },
  es: {
    heading: "Mantente al día",
    description: "Recibe noticias y ofertas de vez en cuando. Sin spam.",
    placeholder: "Tu correo electrónico",
    submitLabel: "Suscribirse",
    successMessage: "¡Gracias! Ya estás suscrito.",
  },
  tr: {
    heading: "Güncel kalın",
    description: "Ara sıra haber ve teklifler alın. İstenmeyen posta yok.",
    placeholder: "E-posta adresiniz",
    submitLabel: "Abone ol",
    successMessage: "Teşekkürler! Abone oldunuz.",
  },
  ar: {
    heading: "ابقَ على اطلاع",
    description: "احصل على الأخبار والعروض من حين لآخر. دون رسائل مزعجة.",
    placeholder: "بريدك الإلكتروني",
    submitLabel: "اشترك",
    successMessage: "شكرًا! تم اشتراكك.",
  },
  fa: {
    heading: "به‌روز بمانید",
    description: "گاهی خبرها و پیشنهادها را دریافت کنید. بدون هرزنامه.",
    placeholder: "ایمیل شما",
    submitLabel: "عضویت",
    successMessage: "متشکریم! عضو شدید.",
  },
};

export function newsletterDefaults(lang: SiteLocale): NewsletterSignup {
  return DEFAULTS[lang];
}
import type { SiteLocale } from "../i18n/site-locales";
