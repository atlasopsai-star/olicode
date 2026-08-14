export type DesignBrief = {
  productType: string
  brandAttributes: string[]
  emotionalTarget: string[]
  platform: "web" | "mobile" | "desktop"
}

export type Contract = {
  brief: DesignBrief
  audience: string
  visualDirection: string
  variance: "low" | "medium" | "high"
  motion: "restrained" | "expressive"
  density: "airy" | "balanced" | "dense"
  typographyDirection: string
  layoutDirection: string
  colorDirection: string
  avoidPatterns: string[]
  responsiveRequirements: string[]
  accessibilityRequirements: string[]
}

const PRODUCT_TYPES: Array<[RegExp, string]> = [
  [/\bdashboard\b/i, "dashboard"],
  [/\blanding page\b/i, "landing page"],
  [/\be-?commerce\b|\bstorefront\b|\bonline shop\b/i, "e-commerce"],
  [/\bportfolio\b/i, "portfolio"],
  [/\badmin panel\b|\bback ?office\b/i, "admin panel"],
  [/\bmarketing (?:site|page)\b/i, "marketing site"],
  [/\bhomepage\b|\blocal service\b/i, "local service homepage"],
  [/\bblog\b/i, "blog"],
  [/\bsaas\b/i, "SaaS product"],
]

const BRAND_ATTRIBUTES: Array<[RegExp, string]> = [
  [/\bpremium\b|\bluxury\b|\bhigh-?end\b/i, "premium"],
  [/\bplayful\b|\bfun\b/i, "playful"],
  [/\bminimal(?:ist)?\b/i, "minimal"],
  [/\btechnical\b|\bdeveloper\b/i, "technical"],
  [/\beditorial\b/i, "editorial"],
  [/\bbold\b/i, "bold"],
  [/\bcorporate\b|\bprofessional\b/i, "professional"],
  [/\bwarm\b|\bfriendly\b/i, "warm"],
]

// The generic-AI-slop patterns this product exists to avoid. Kept as a fixed
// checklist rather than another skill load -- cheap, always relevant to any
// design-classified task, no extra context cost. Sharpened against concrete,
// named "AI tells" (not just vague description) after reviewing external
// design-taste references -- specific bans are easier for a model to check
// itself against than generic prose ("avoid generic hero" vs "no purple-to-
// blue gradient, no glow, no #000000").
const AVOID_PATTERNS = [
  "the 'AI purple' aesthetic: purple-to-blue gradient heroes, neon glows, oversaturated accent colors",
  "three identical feature cards (icon, title, paragraph) with no hierarchy variation",
  "a centered hero built around generic stock-photo-style illustration",
  "the default system font stack (Arial/Helvetica) presented with no deliberate type pairing or hierarchy",
  "pure black (#000000) backgrounds or text -- use an off-black, charcoal, or deep neutral instead",
  "uniform rounded-xl cards applied everywhere regardless of content",
  "repeating boxed cards where hierarchy, editorial composition, lists, or a single structured surface would communicate better",
  "pill-shaped navigation and labels used as a default visual motif",
  "viewport-scale empty regions used to simulate luxury while leaving the product journey incomplete",
  "glassmorphism or glow effects with no stated rationale",
  "a mobile view that is just the desktop layout stacked vertically",
  "placeholder content that reads as generic: names like 'John Doe', filler marketing words like 'Elevate', 'Seamless', 'Unleash', 'Next-Gen', or suspiciously round stats like exactly '99.9%'",
]

// Small, curated, dependency-free directions -- not a searchable design
// database. A handful of concrete options beats one generic paragraph; kept
// tiny on purpose so this stays a cheap lookup, not a new subsystem.
const COLOR_DIRECTIONS: Record<string, string> = {
  premium:
    "a restrained neutral base (warm charcoal or deep slate, never pure black) with exactly one saturated, purposeful accent -- avoid the default blue/purple AI palette",
  minimal: "near-monochrome neutrals with a single low-saturation accent used sparingly, not decoratively",
  playful: "a warm, saturated primary paired with one unexpected secondary hue -- avoid default Bootstrap-blue or Tailwind-indigo defaults",
  technical: "a cool neutral base (zinc/slate) with a single high-contrast signal color reserved for status and actionable elements",
  editorial: "an ink-and-paper neutral palette (warm off-white, near-black ink) with a restrained editorial accent, not a tech-brand accent",
  bold: "high-contrast neutrals with one confident saturated accent carried consistently, not multiple competing brights",
  professional: "a cool neutral base with a single trust-signaling accent (deep blue, forest, or burgundy) applied with restraint",
  warm: "warm neutral tones (cream, sand, terracotta-adjacent) with a single grounded accent, avoiding cold grays",
}

const TYPOGRAPHY_DIRECTIONS: Record<string, string> = {
  premium: "a distinctive display face for headlines with restrained tracking, paired with a highly legible body face -- not a system-default stack presented without pairing",
  minimal: "one typeface family across the whole interface, using weight and size alone (not decoration) to carry hierarchy",
  editorial: "a serif or high-contrast display face for headlines paired with a neutral sans body face, evoking print rather than software",
  technical: "a clean grotesque sans for UI text, with tabular/monospace figures for any numeric data",
  bold: "an oversized, confident display face for the primary headline with a quiet body face underneath it",
}

export function brief(query: string): DesignBrief {
  const productType = PRODUCT_TYPES.find(([pattern]) => pattern.test(query))?.[1] ?? "web interface"
  const brandAttributes = BRAND_ATTRIBUTES.filter(([pattern]) => pattern.test(query)).map(([, label]) => label)
  const platform = /\bmobile app\b|\bios\b|\bandroid\b/i.test(query)
    ? "mobile"
    : /\bdesktop app\b/i.test(query)
      ? "desktop"
      : "web"
  return {
    productType,
    brandAttributes: brandAttributes.length ? brandAttributes : ["distinctive", "purpose-built"],
    emotionalTarget: brandAttributes.length ? brandAttributes : ["confidence", "clarity"],
    platform,
  }
}

function pick(table: Record<string, string>, attributes: string[], fallback: string): string {
  for (const attribute of attributes) if (table[attribute]) return table[attribute]!
  return fallback
}

export function contract(query: string): Contract {
  const active = brief(query)
  const audience =
    (query.match(/\bserving\s+([^.!?]+)/i) ?? query.match(/\bfor\s+([^.!?]+)/i))?.[1]?.trim() ??
    "the product's stated users"
  const premium = active.brandAttributes.includes("premium")
  return {
    brief: active,
    audience,
    visualDirection: premium
      ? "restrained editorial luxury grounded in the product's real materials, language, and customer context"
      : "a distinctive, product-specific system with an intentional visual point of view",
    variance: /\b(?:distinctive|bold|non-generic|not (?:a )?generic)\b/i.test(query) ? "high" : "medium",
    motion: /\b(?:animated|motion|interactive)\b/i.test(query) ? "expressive" : "restrained",
    density: active.productType === "dashboard" ? "dense" : "balanced",
    typographyDirection: pick(
      TYPOGRAPHY_DIRECTIONS,
      active.brandAttributes,
      "deliberate type hierarchy chosen for the product rather than a default system stack",
    ),
    layoutDirection:
      active.productType === "local service homepage"
        ? "an editorial, asymmetrical service narrative with varied section composition and a clear booking journey"
        : "vary composition by content hierarchy; do not turn every concept into another interchangeable card",
    colorDirection: pick(
      COLOR_DIRECTIONS,
      active.brandAttributes,
      "a product-specific palette with accessible contrast and controlled accents",
    ),
    avoidPatterns: AVOID_PATTERNS,
    responsiveRequirements: [
      "Check the layout at a narrow mobile width, not only desktop.",
      "Mobile should be its own deliberate composition, not the desktop layout stacked.",
    ],
    accessibilityRequirements: [
      "Sufficient color contrast for text against its background.",
      "Interactive elements are keyboard-reachable and have a visible focus state.",
    ],
  }
}

export function checklist(active: Contract) {
  return [
    "<olicode_design_contract>",
    `Product type: ${active.brief.productType}`,
    `Brand attributes to express: ${active.brief.brandAttributes.join(", ")}`,
    `Platform: ${active.brief.platform}`,
    `Audience: ${active.audience}`,
    `Visual direction: ${active.visualDirection}`,
    `Variance: ${active.variance}; motion: ${active.motion}; density: ${active.density}`,
    `Typography: ${active.typographyDirection}`,
    `Layout: ${active.layoutDirection}`,
    `Color: ${active.colorDirection}`,
    "Avoid, unless a stated reason makes it the right call here:",
    ...active.avoidPatterns.map((item) => `- ${item}`),
    ...active.responsiveRequirements.map((item) => `- ${item}`),
    ...active.accessibilityRequirements.map((item) => `- ${item}`),
    "The desktop screenshot, mobile screenshot, and console check are required completion evidence, not scratch build output -- do not delete or clean them up. Leave them in place for the verification step.",
    "Before finishing: could this result belong to 100 unrelated AI-generated products? If yes, it needs a more specific, deliberate identity, not more polish on the generic version.",
    "</olicode_design_contract>",
  ].join("\n")
}

export * as Design from "./design-contract"
