import "server-only";
import { allMeasurementFields, fieldBounds } from "@/config/measurements";
import { isPurchasable } from "@/server/commerce/service";
import { getRepositories } from "@/server/data";
import type { StoreRepositories } from "@/server/data/repositories";
import type {
  CartItem,
  CustomizationRequest,
  MeasurementProfile,
  OrderItem,
  OrderItemMeasurementSnapshot,
  Product,
} from "@/types/domain";

/**
 * Cart-line configuration (Phase 7A) — the ONE place stitching
 * configuration is validated and its `configurationKey` derived.
 *
 * A configuration is currently one of exactly two shapes:
 *
 *   Unstitched — the default. No measurement profile. This is also the
 *   configuration of every pre-7A cart line, so its key stays `""` and
 *   legacy lines merge naturally with newly added unstitched lines.
 *
 *   Stitched — allowed only when the product's `stitchingAvailable` flag
 *   is set, and REQUIRES a measurement profile that exists, belongs to
 *   the authenticated user, and is not archived.
 *
 * No stitching price exists anywhere in the product model, so none is
 * invented: a configuration never changes the line's price. When the
 * business adds a stitching fee, it will land here (the validated
 * configuration is the natural carrier for a future price contribution).
 *
 * TRUST BOUNDARY — the browser only ever *proposes* `{ stitching,
 * measurementProfileId }`. Everything is re-verified server-side against
 * the product row and the profile row, and the `configurationKey` is
 * ALWAYS recomputed here from the validated result — a client-supplied
 * key is never read anywhere in the codebase.
 */

/* ── the key ────────────────────────────────────────────────────── */

/**
 * Deterministic, server-derived line identity. Two cart lines are the
 * same line if and only if product AND configuration match — backed by
 * the `(cart_id, product_id, configuration_key)` unique constraint in
 * PostgreSQL.
 *
 *   unstitched            → ""            (pre-7A compatible)
 *   stitched + profile P  → "stitched:P"
 *
 * The profile id is the customer's own row id (already visible to them
 * in their account URLs) and the key never leaves the server, so a
 * readable key beats an opaque hash.
 */
export function deriveConfigurationKey(
  stitching: CartItem["stitching"],
): string {
  if (stitching?.selected && stitching.measurementProfileId) {
    return `stitched:${stitching.measurementProfileId}`;
  }
  return "";
}

/** The four reserved fields, in one place — checkout and the order
 *  success view both key their "custom configuration" indicator on this. */
export function itemHasConfiguration(
  item: Pick<
    CartItem | OrderItem,
    "configurationKey" | "stitching" | "customizationRequestId" | "notes"
  >,
): boolean {
  return (
    item.configurationKey !== "" ||
    item.stitching !== undefined ||
    item.customizationRequestId !== undefined ||
    (item.notes !== undefined && item.notes !== "")
  );
}

/* ── validating a PROPOSED configuration (add / change) ─────────── */

/** What a browser may propose. Parsed defensively — see
 *  `parseConfigurationInput`. */
export interface CartConfigurationInput {
  stitching: "unstitched" | "stitched";
  measurementProfileId?: string;
}

/**
 * Defensive parse of a client-supplied configuration argument.
 * `undefined`/`null` mean the pre-7A default (unstitched) so every
 * existing caller keeps working. Returns null for anything malformed.
 *
 * A `measurementProfileId` sent alongside "unstitched" is DISCARDED, not
 * an error: unstitched stores no profile, so nothing unvalidated can
 * ride along.
 */
export function parseConfigurationInput(
  value: unknown,
): CartConfigurationInput | null {
  if (value === undefined || value === null) {
    return { stitching: "unstitched" };
  }
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.stitching === "unstitched") return { stitching: "unstitched" };
  if (raw.stitching === "stitched") {
    if (
      typeof raw.measurementProfileId !== "string" ||
      raw.measurementProfileId === ""
    ) {
      // Stitched with no profile is still parseable — validation turns it
      // into the friendly "choose a profile" rejection.
      return { stitching: "stitched" };
    }
    return {
      stitching: "stitched",
      measurementProfileId: raw.measurementProfileId,
    };
  }
  return null;
}

/** The validated, storage-ready configuration. */
export interface ValidatedConfiguration {
  configurationKey: string;
  /** Absent for unstitched — the pre-7A shape of an unconfigured line. */
  stitching?: { selected: true; measurementProfileId: string };
  /** Resolved profile for stitched configurations (label for the UI). */
  profile?: MeasurementProfile;
}

export type ConfigurationValidation =
  | { ok: true; config: ValidatedConfiguration }
  | {
      ok: false;
      reason:
        | "product_unavailable"
        | "stitching_not_available"
        | "profile_required"
        | "profile_invalid";
      message: string;
    };

/**
 * Validate a proposed configuration for THIS user and THIS product.
 *
 * Every rule lives here (§20) — add-to-cart, configuration changes,
 * checkout and order creation all call this rather than re-implementing:
 *   - product exists, is published, is not archived, is purchasable
 *   - stitching is only configurable when the product offers it
 *   - stitched requires a measurement profile that exists, BELONGS TO
 *     THE USER and is not archived — a foreign, archived or unknown id
 *     fails identically, revealing nothing
 *
 * `repos` is injectable so the order transaction (Phase 6C) can run the
 * SAME validation against its transaction-scoped repositories.
 */
export async function validateCartConfiguration(options: {
  userId: string;
  product: Product;
  input: CartConfigurationInput;
  repos?: Pick<StoreRepositories, "measurementProfiles">;
}): Promise<ConfigurationValidation> {
  const { userId, product, input } = options;
  const repos = options.repos ?? getRepositories();

  if (!isPurchasable(product)) {
    return {
      ok: false,
      reason: "product_unavailable",
      message: "This product is not available.",
    };
  }

  if (input.stitching === "unstitched") {
    return { ok: true, config: { configurationKey: "" } };
  }

  // Stitched from here on.
  if (!product.stitchingAvailable) {
    return {
      ok: false,
      reason: "stitching_not_available",
      message: "This piece is not offered with stitching.",
    };
  }
  if (!input.measurementProfileId) {
    return {
      ok: false,
      reason: "profile_required",
      message: "Choose a measurement profile for stitching.",
    };
  }

  const profile = await repos.measurementProfiles.getById(
    input.measurementProfileId,
  );
  // Ownership + liveness — the same rule as the account pages
  // (`getOwnedMeasurementProfile`): missing, foreign and archived are
  // indistinguishable to the caller.
  if (!profile || profile.userId !== userId || profile.archivedAt) {
    return {
      ok: false,
      reason: "profile_invalid",
      message: "That measurement profile is not available.",
    };
  }

  const stitching = {
    selected: true as const,
    measurementProfileId: profile.id,
  };
  return {
    ok: true,
    config: {
      configurationKey: deriveConfigurationKey(stitching),
      stitching,
      profile,
    },
  };
}

/* ── validating an EXISTING cart line (cart / checkout / order) ──── */

export type LineConfigurationIssue =
  /** The referenced measurement profile was archived after the line was
   *  configured. The line is preserved and flagged — never deleted. */
  | "profile_archived"
  /** The referenced profile no longer resolves to this customer. */
  | "profile_missing"
  /** The product no longer offers stitching. */
  | "stitching_not_available";

export type LineConfigurationCheck =
  | {
      ok: true;
      stitched: boolean;
      /** Resolved for healthy stitched lines. */
      profile?: MeasurementProfile;
    }
  | {
      ok: false;
      issue: LineConfigurationIssue;
      /** Still resolved when the profile row exists (e.g. archived) so
       *  the UI can name it. */
      profile?: MeasurementProfile;
    };

/**
 * Re-validate the configuration a cart line ALREADY carries. Used by the
 * cart view, checkout readiness and the order-creation transaction, so a
 * line whose profile was archived — or whose product stopped offering
 * stitching — blocks checkout instead of silently proceeding (§23).
 *
 * Product-level availability (unpublished/archived/unpurchasable) is the
 * existing `unavailable` flag's job and is NOT re-checked here; when the
 * product row is absent from the caller (line already unavailable) the
 * stitching capability check is skipped.
 */
export async function checkCartLineConfiguration(options: {
  userId: string;
  item: Pick<CartItem, "stitching">;
  /** The product when it is still visible; null/undefined otherwise. */
  product?: Product | null;
  repos?: Pick<StoreRepositories, "measurementProfiles">;
}): Promise<LineConfigurationCheck> {
  const { userId, item, product } = options;
  const repos = options.repos ?? getRepositories();

  if (!item.stitching?.selected) return { ok: true, stitched: false };

  if (product && !product.stitchingAvailable) {
    return { ok: false, issue: "stitching_not_available" };
  }

  const profileId = item.stitching.measurementProfileId;
  if (!profileId) return { ok: false, issue: "profile_missing" };

  const profile = await repos.measurementProfiles.getById(profileId);
  if (!profile || profile.userId !== userId) {
    return { ok: false, issue: "profile_missing" };
  }
  if (profile.archivedAt) {
    return { ok: false, issue: "profile_archived", profile };
  }
  return { ok: true, stitched: true, profile };
}

/* ── the order-time measurement snapshot (Phase 7B) ─────────────── */

/** Bounds for the KNOWN catalog keys, by unit — the same rule the
 *  measurement form enforces at save time. Unknown keys are allowed by
 *  design (domain doc) and get only the generic numeric checks. */
const KNOWN_FIELDS = new Map(allMeasurementFields.map((f) => [f.key, f]));

export type MeasurementSnapshotResult =
  | { ok: true; snapshot: OrderItemMeasurementSnapshot }
  | { ok: false; problem: string };

/**
 * Build the immutable order-time measurement snapshot from the
 * AUTHORITATIVE profile row (§18) — the one validator for it, used
 * inside the order transaction on the transaction-read profile. The
 * browser never contributes a single measurement value.
 *
 * Every field is re-validated even though the save path already
 * enforced it — an order snapshot must never memorialise malformed
 * data:
 *   - unit is exactly "cm" or "in" (value/unit pairs stay unambiguous)
 *   - at least one value; every key a non-empty string; every value a
 *     finite positive number; known catalog keys within the same bounds
 *     the form enforces for that unit
 *   - fitPreference one of the known preferences, or ABSENT — absence
 *     is preserved, no default is invented (§17)
 *   - notes within the profile schema's 500-char cap
 * The returned snapshot is a fresh deep copy — never a reference into
 * the live profile object.
 */
export function buildMeasurementSnapshot(
  profile: MeasurementProfile,
): MeasurementSnapshotResult {
  if (profile.unit !== "cm" && profile.unit !== "in") {
    return { ok: false, problem: `unknown unit "${String(profile.unit)}"` };
  }
  if (!Array.isArray(profile.values) || profile.values.length === 0) {
    return { ok: false, problem: "profile has no measurement values" };
  }
  const values: OrderItemMeasurementSnapshot["values"] = [];
  for (const entry of profile.values) {
    if (typeof entry?.key !== "string" || entry.key.trim() === "") {
      return { ok: false, problem: "measurement with an empty key" };
    }
    if (typeof entry.value !== "number" || !Number.isFinite(entry.value) || entry.value <= 0) {
      return { ok: false, problem: `invalid value for "${entry.key}"` };
    }
    const known = KNOWN_FIELDS.get(entry.key);
    if (known) {
      const { min, max } = fieldBounds(known, profile.unit);
      if (entry.value < min || entry.value > max) {
        return { ok: false, problem: `"${entry.key}" outside ${min}–${max} ${profile.unit}` };
      }
    }
    values.push({ key: entry.key, value: entry.value });
  }
  if (
    profile.fitPreference !== undefined &&
    !["fitted", "regular", "relaxed"].includes(profile.fitPreference)
  ) {
    return { ok: false, problem: "unknown fit preference" };
  }
  if (profile.notes !== undefined && (typeof profile.notes !== "string" || profile.notes.length > 500)) {
    return { ok: false, problem: "malformed profile notes" };
  }

  return {
    ok: true,
    snapshot: {
      unit: profile.unit,
      ...(profile.fitPreference === undefined
        ? {}
        : { fitPreference: profile.fitPreference }),
      ...(profile.notes === undefined || profile.notes === ""
        ? {}
        : { notes: profile.notes }),
      values,
    },
  };
}

/* ── customization attachment seam (Phase 7B foundation) ────────── */

export type CustomizationAttachmentValidation =
  | { ok: true; request: CustomizationRequest }
  | {
      ok: false;
      reason: "customization_not_available" | "request_invalid";
      message: string;
    };

/**
 * Validation seam for the FUTURE flow that attaches a customization
 * request to a cart line / order. Nothing calls it from a customer path
 * yet (attachment is deliberately not wired in Phase 7B), but the rules
 * live here from day one so the designer phase cannot re-invent them:
 * the product must offer customization, and the request must exist and
 * belong to the authenticated user — foreign, unknown and missing ids
 * fail identically.
 */
export async function validateCustomizationAttachment(options: {
  userId: string;
  product: Product;
  customizationRequestId: string;
  repos?: Pick<StoreRepositories, "customizationRequests">;
}): Promise<CustomizationAttachmentValidation> {
  const { userId, product, customizationRequestId } = options;
  const repos = options.repos ?? getRepositories();

  if (!product.customizationAvailable) {
    return {
      ok: false,
      reason: "customization_not_available",
      message: "This piece is not offered with customisation.",
    };
  }
  const request =
    typeof customizationRequestId === "string" && customizationRequestId
      ? await repos.customizationRequests.getById(customizationRequestId)
      : null;
  if (!request || request.userId !== userId) {
    return {
      ok: false,
      reason: "request_invalid",
      message: "That customisation request is not available.",
    };
  }
  // A request that names a product binds to THAT product — it can never
  // be attached to a different piece. Product-less (fully custom)
  // requests are free to attach anywhere customization is offered.
  if (request.productId !== undefined && request.productId !== product.id) {
    return {
      ok: false,
      reason: "request_invalid",
      message: "That customisation request is not available.",
    };
  }
  return { ok: true, request };
}
