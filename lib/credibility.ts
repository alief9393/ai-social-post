import type { Tier } from "./types";

/**
 * Source credibility tiers. Edit these lists to tune scoring.
 * Matching is by domain suffix, so "kompas.com" also covers "tekno.kompas.com".
 */
const PRIMARY_SUFFIXES = [
  ".go.id", ".ac.id", ".gov", ".edu", "who.int", "un.org", "unep.org", "worldbank.org",
  "iea.org", "oecd.org", "imf.org", "nature.com", "science.org", "sciencedirect.com",
  "springer.com", "arxiv.org", "bps.go.id", "bmkg.go.id",
];

const ESTABLISHED = [
  "kompas.com", "kompas.id", "tempo.co", "antaranews.com", "cnnindonesia.com",
  "cnbcindonesia.com", "detik.com", "katadata.co.id", "bisnis.com", "kontan.co.id",
  "thejakartapost.com", "jakartaglobe.id", "tirto.id", "liputan6.com", "republika.co.id",
  "mediaindonesia.com", "beritasatu.com", "mongabay.co.id", "mongabay.com", "theconversation.com",
  "bbc.com", "bbc.co.uk", "reuters.com", "apnews.com", "bloomberg.com", "ft.com",
  "nytimes.com", "theguardian.com", "washingtonpost.com", "economist.com", "nikkei.com",
  "aljazeera.com", "dw.com", "voaindonesia.com", "technologyreview.com", "wired.com",
  "theverge.com", "arstechnica.com",
];

const MEDIA = [
  "idntimes.com", "suara.com", "okezone.com", "sindonews.com", "tribunnews.com",
  "merdeka.com", "kumparan.com", "inews.id", "jpnn.com", "viva.co.id", "grid.id",
  "jawapos.com", "pikiran-rakyat.com", "medcom.id", "metrotvnews.com", "tvonenews.com",
  "kompasiana.com", "cnet.com", "techcrunch.com", "zdnet.com",
];

/** Outlet display names Google News uses, mapped to a domain. */
const NAME_TO_DOMAIN: Record<string, string> = {
  "kompas.com": "kompas.com", "kompas.id": "kompas.id", "kompas": "kompas.com",
  "tempo.co": "tempo.co", "tempo": "tempo.co", "antara news": "antaranews.com",
  "antaranews.com": "antaranews.com", "cnn indonesia": "cnnindonesia.com",
  "cnbc indonesia": "cnbcindonesia.com", "detiknews": "detik.com", "detikinet": "detik.com",
  "detikfinance": "detik.com", "detikcom": "detik.com", "katadata": "katadata.co.id",
  "bisnis.com": "bisnis.com", "kontan": "kontan.co.id", "the jakarta post": "thejakartapost.com",
  "jakarta globe": "jakartaglobe.id", "tirto.id": "tirto.id", "liputan6.com": "liputan6.com",
  "republika online": "republika.co.id", "media indonesia": "mediaindonesia.com",
  "beritasatu.com": "beritasatu.com", "mongabay.co.id": "mongabay.co.id",
  "the conversation": "theconversation.com", "bbc": "bbc.com", "reuters": "reuters.com",
  "idn times": "idntimes.com", "suara.com": "suara.com", "okezone": "okezone.com",
  "sindonews": "sindonews.com", "tribunnews.com": "tribunnews.com", "merdeka.com": "merdeka.com",
  "kumparan": "kumparan.com", "kumparan.com": "kumparan.com", "jpnn.com": "jpnn.com",
  "viva.co.id": "viva.co.id", "jawapos.com": "jawapos.com",
};

function matches(domain: string, list: string[]): boolean {
  return list.some((s) => (s.startsWith(".") ? domain.endsWith(s) : domain === s || domain.endsWith("." + s)));
}

export function tierOf(domain: string): Tier {
  if (!domain) return "unknown";
  if (matches(domain, PRIMARY_SUFFIXES)) return "primary";
  if (matches(domain, ESTABLISHED)) return "established";
  if (matches(domain, MEDIA)) return "media";
  return "unknown";
}

export function domainFromOutletName(name: string): string {
  const n = name.trim().toLowerCase();
  if (NAME_TO_DOMAIN[n]) return NAME_TO_DOMAIN[n];
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(n)) return n.replace(/^www\./, "");
  return "";
}

export const TIER_WEIGHT: Record<Tier, number> = {
  primary: 1,
  established: 0.8,
  media: 0.55,
  unknown: 0.4,
  community: 0.2,
};
