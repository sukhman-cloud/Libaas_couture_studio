/**
 * Measurement catalog — the known measurement fields, grouped for the UI.
 * The data model stores plain {key, value} pairs, so adding a field here
 * (or introducing garment-specific keys later) needs no schema change.
 * None of these are required — different garments need different subsets.
 */

export interface MeasurementFieldDef {
  key: string;
  label: string;
  /** Sensible bounds for validation, in centimetres. */
  minCm: number;
  maxCm: number;
}

export interface MeasurementGroup {
  key: string;
  label: string;
  fields: MeasurementFieldDef[];
}

export const measurementGroups: MeasurementGroup[] = [
  {
    key: "upper",
    label: "Upper body",
    fields: [
      { key: "bust", label: "Bust", minCm: 40, maxCm: 200 },
      { key: "waist", label: "Waist", minCm: 30, maxCm: 200 },
      { key: "shoulder", label: "Shoulder", minCm: 20, maxCm: 80 },
      { key: "armhole", label: "Armhole", minCm: 20, maxCm: 80 },
      { key: "sleeve_length", label: "Sleeve length", minCm: 10, maxCm: 90 },
    ],
  },
  {
    key: "garment",
    label: "Garment lengths",
    fields: [
      { key: "suit_length", label: "Suit length", minCm: 40, maxCm: 200 },
      { key: "kurta_length", label: "Kurta length", minCm: 40, maxCm: 200 },
      { key: "bottom_length", label: "Bottom length", minCm: 40, maxCm: 160 },
    ],
  },
  {
    key: "bottom",
    label: "Lower body",
    fields: [
      { key: "hip", label: "Hip", minCm: 40, maxCm: 220 },
      { key: "thigh", label: "Thigh", minCm: 20, maxCm: 130 },
      { key: "ankle_opening", label: "Ankle / opening", minCm: 10, maxCm: 80 },
    ],
  },
];

export const allMeasurementFields: MeasurementFieldDef[] =
  measurementGroups.flatMap((group) => group.fields);

const CM_PER_INCH = 2.54;

/** Bounds for a field in the profile's unit. */
export function fieldBounds(field: MeasurementFieldDef, unit: "cm" | "in") {
  if (unit === "cm") return { min: field.minCm, max: field.maxCm };
  return {
    min: Math.floor((field.minCm / CM_PER_INCH) * 10) / 10,
    max: Math.ceil((field.maxCm / CM_PER_INCH) * 10) / 10,
  };
}

export const fitPreferences = [
  { value: "fitted", label: "Fitted" },
  { value: "regular", label: "Regular" },
  { value: "relaxed", label: "Relaxed" },
] as const;
