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
// design-classified task, no extra context cost.
const AVOID_PATTERNS = [
  "a purple-to-blue gradient hero as the default background",
  "three identical feature cards (icon, title, paragraph) with no hierarchy variation",
  "a centered hero built around generic stock-photo-style illustration",
  "the default system font stack with no deliberate type pairing",
  "uniform rounded-xl cards applied everywhere regardless of content",
  "repeating boxed cards where hierarchy, editorial composition, lists, or a single structured surface would communicate better",
  "pill-shaped navigation and labels used as a default visual motif",
  "viewport-scale empty regions used to simulate luxury while leaving the product journey incomplete",
  "glassmorphism or glow effects with no stated rationale",
  "a mobile view that is just the desktop layout stacked vertically",
]

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
    typographyDirection: premium
      ? "editorial display typography paired with a highly legible restrained text face"
      : "deliberate type hierarchy chosen for the product rather than a default system stack",
    layoutDirection:
      active.productType === "local service homepage"
        ? "an editorial, asymmetrical service narrative with varied section composition and a clear booking journey"
        : "vary composition by content hierarchy; do not turn every concept into another interchangeable card",
    colorDirection: premium
      ? "a restrained material palette with excellent contrast and one purposeful accent"
      : "a product-specific palette with accessible contrast and controlled accents",
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
    "Before finishing: could this result belong to 100 unrelated AI-generated products? If yes, it needs a more specific, deliberate identity, not more polish on the generic version.",
    "</olicode_design_contract>",
  ].join("\n")
}

export * as Design from "./design-contract"
