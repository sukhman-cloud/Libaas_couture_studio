"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Heading, Text } from "@/components/ui/typography";
import {
  allMeasurementFields,
  fieldBounds,
  fitPreferences,
  measurementGroups,
} from "@/config/measurements";
import {
  saveMeasurementProfile,
  type AccountFormState,
} from "@/lib/account/actions";
import type { MeasurementProfile, MeasurementUnit } from "@/types/domain";

const initialState: AccountFormState = {};

export function MeasurementForm({
  profile,
}: {
  profile: MeasurementProfile | null;
}) {
  const [state, formAction, isPending] = useActionState(
    saveMeasurementProfile,
    initialState,
  );
  const [unit, setUnit] = useState<MeasurementUnit>(profile?.unit ?? "cm");

  // Numeric inputs are controlled: this converts values when the unit is
  // switched (no silent cm↔in reinterpretation) AND keeps everything the
  // user typed through a validation error (React resets uncontrolled fields
  // after a form action). Seeded from the echoed submission or stored profile.
  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const field of allMeasurementFields) {
      const echoed = state.values?.[`m_${field.key}`];
      const stored = profile?.values.find((v) => v.key === field.key)?.value;
      if (echoed !== undefined) seed[field.key] = echoed;
      else if (stored !== undefined) seed[field.key] = String(stored);
    }
    return seed;
  });

  function changeUnit(next: MeasurementUnit) {
    if (next === unit) return;
    const factor = next === "in" ? 1 / 2.54 : 2.54;
    setValues((prev) => {
      const converted: Record<string, string> = {};
      for (const [key, raw] of Object.entries(prev)) {
        if (raw.trim() === "") continue;
        const num = Number(raw);
        converted[key] = Number.isFinite(num)
          ? String(Math.round(num * factor * 10) / 10)
          : raw;
      }
      return converted;
    });
    setUnit(next);
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {profile && <input type="hidden" name="profileId" value={profile.id} />}

      <Card>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Profile name"
              name="label"
              required
              placeholder="e.g. Myself"
              defaultValue={state.values?.label ?? profile?.label}
              error={state.fieldErrors?.label}
              hint="Just a label — e.g. Myself, Mom, Sister."
            />
            <FormField label="Unit" error={state.fieldErrors?.unit}>
              <Select
                name="unit"
                value={unit}
                onChange={(event) =>
                  changeUnit(event.target.value as MeasurementUnit)
                }
              >
                <option value="cm">Centimetres (cm)</option>
                <option value="in">Inches (in)</option>
              </Select>
            </FormField>
            <FormField
              label="Fit preference"
              error={state.fieldErrors?.fitPreference}
            >
              <Select
                name="fitPreference"
                defaultValue={
                  state.values?.fitPreference ?? profile?.fitPreference ?? ""
                }
              >
                <option value="">No preference</option>
                {fitPreferences.map((fit) => (
                  <option key={fit.value} value={fit.value}>
                    {fit.label}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <Text tone="muted" size="sm">
            All measurements below are in{" "}
            <strong>{unit === "cm" ? "centimetres" : "inches"}</strong>. Fill
            only what you know — nothing is required, and different garments
            need different measurements.
          </Text>
        </CardContent>
      </Card>

      {measurementGroups.map((group) => (
        <Card key={group.key}>
          <CardContent>
            <Heading level={3} className="mb-4 text-lg">
              {group.label}
            </Heading>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.fields.map((field) => {
                const bounds = fieldBounds(field, unit);
                return (
                  <Input
                    key={field.key}
                    label={`${field.label} (${unit})`}
                    name={`m_${field.key}`}
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min={bounds.min}
                    max={bounds.max}
                    value={values[field.key] ?? ""}
                    onChange={(event) =>
                      setValues((prev) => ({
                        ...prev,
                        [field.key]: event.target.value,
                      }))
                    }
                    error={state.fieldErrors?.[field.key]}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent>
          <FormField
            label="Notes (optional)"
            hint="Dupatta preference, styling notes, anything the tailor should know."
            error={state.fieldErrors?.notes}
          >
            <Textarea
              name="notes"
              rows={3}
              defaultValue={state.values?.notes ?? profile?.notes}
              placeholder="e.g. Prefers full dupatta with lace border…"
            />
          </FormField>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" isLoading={isPending}>
          {profile ? "Save changes" : "Save measurement profile"}
        </Button>
        <Link
          href="/account/measurements"
          className={buttonStyles({ variant: "ghost" })}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
