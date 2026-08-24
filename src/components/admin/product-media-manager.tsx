"use client";

import Image from "next/image";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { ImagePlus, Star, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Heading, Text } from "@/components/ui/typography";
import {
  deleteProductMedia,
  setPrimaryProductMedia,
  updateProductMediaAlt,
  uploadProductMedia,
  type CatalogFormState,
} from "@/lib/catalog/actions";
import type { ProductMedia } from "@/types/domain";

const initialState: CatalogFormState = {};

export function ProductMediaManager({
  productId,
  media,
}: {
  productId: string;
  media: ProductMedia[];
}) {
  const [state, formAction, isUploading] = useActionState(
    uploadProductMedia,
    initialState,
  );
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<ProductMedia | null>(null);
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const lastState = useRef<CatalogFormState | null>(null);

  useEffect(() => {
    if (state.success && lastState.current !== state) {
      lastState.current = state;
      toast({ title: state.success, tone: "success" });
      formRef.current?.reset();
    }
  }, [state, toast]);

  function run(action: () => Promise<CatalogFormState>) {
    startTransition(async () => {
      const result = await action();
      if (result.error) toast({ title: result.error, tone: "danger" });
      else if (result.success) toast({ title: result.success, tone: "success" });
    });
  }

  const sorted = [...media].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <Card>
      <CardContent className="space-y-5">
        <div>
          <Heading level={3} className="text-lg">
            Media
          </Heading>
          <Text tone="muted" size="sm" className="mt-1">
            JPEG, PNG, WebP or AVIF up to 5 MB. The primary image represents
            the product in listings. Uploaded files are served from a public
            URL, so only upload images that are safe to share.
          </Text>
        </div>

        {state.error && <Alert tone="danger">{state.error}</Alert>}

        <form
          ref={formRef}
          action={formAction}
          className="grid gap-3 rounded-xl border border-dashed border-navy-200 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        >
          <input type="hidden" name="productId" value={productId} />
          <FormField label="Image file" error={state.fieldErrors?.file}>
            <input
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              required
              className="w-full text-sm text-ink file:mr-3 file:rounded-full file:border-0 file:bg-navy-700 file:px-4 file:py-2 file:text-sm file:text-cream-50 hover:file:bg-navy-800"
            />
          </FormField>
          <Input
            label="Alt text"
            name="alt"
            hint="Describe the image for screen readers."
          />
          <Button type="submit" isLoading={isUploading}>
            <ImagePlus className="size-4" aria-hidden />
            Upload
          </Button>
        </form>

        {sorted.length === 0 ? (
          <Text tone="muted" size="sm">
            No images yet. Add at least one image before publishing this
            product.
          </Text>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((item) => (
              <li
                key={item.id}
                className="overflow-hidden rounded-xl border border-cream-200"
              >
                <div className="relative aspect-4/5 bg-cream-100">
                  <Image
                    src={`/api/media/${item.mediaId}`}
                    alt={item.alt || "Product image"}
                    fill
                    sizes="(max-width: 640px) 100vw, 33vw"
                    className="object-cover"
                  />
                  {item.isPrimary && (
                    <span className="absolute left-2 top-2">
                      <Badge tone="gold">Primary</Badge>
                    </span>
                  )}
                </div>
                <div className="space-y-2 p-3">
                  <Input
                    aria-label="Alt text"
                    defaultValue={item.alt}
                    placeholder="Alt text"
                    disabled={isPending}
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (next !== item.alt) {
                        run(() =>
                          updateProductMediaAlt(productId, item.id, next),
                        );
                      }
                    }}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {!item.isPrimary && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          run(() => setPrimaryProductMedia(productId, item.id))
                        }
                      >
                        <Star className="size-3.5" aria-hidden />
                        Make primary
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:bg-danger/10"
                      disabled={isPending}
                      onClick={() => setDeleteTarget(item)}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      Delete
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <ConfirmationDialog
          open={deleteTarget !== null}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => {
            if (deleteTarget) {
              run(() => deleteProductMedia(productId, deleteTarget.id));
              setDeleteTarget(null);
            }
          }}
          title="Delete this image?"
          description="The file is permanently removed from storage. This cannot be undone."
          confirmLabel="Delete"
          destructive
          isConfirming={isPending}
        />
      </CardContent>
    </Card>
  );
}
