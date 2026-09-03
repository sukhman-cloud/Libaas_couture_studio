# Phase 9 — Customer Customization Workflow

Phase 9 uses the existing `CustomizationRequest` foundation. A customer may start a product-level request from a published customization-capable product or an order-item request from their own order detail. The server resolves the product/order/item and session owner; client-supplied ownership, status, and IDs are not trusted. Order snapshots and totals are never changed.

## Lifecycle

New requests start as `pending`. The supported transitions are:

- `pending` -> `reviewing`, `rejected`, or customer `cancelled`
- `reviewing` -> `approved`, `in_progress`, or `rejected`
- `approved` -> `in_progress` or `rejected`
- `in_progress` -> `completed` or `rejected`
- terminal statuses have no outgoing transitions

Legacy Phase 7B `draft`/`quoted` requests remain readable and have conservative transitions for compatibility. All transition checks run in `src/server/customization/workflow.ts` and the compare-and-set repository operation runs inside the existing transaction abstraction.

## Customer and admin access

Customers can create requests for themselves, list/detail only their own requests, view their own description/status/timeline, and cancel only pending/reviewing requests. Customer view models omit internal notes, private activity metadata, actor IDs, database IDs, and unrelated customer data.

Admins with `orders.read` can search/filter and inspect requests. Admin status changes and private notes require `orders.write`. Admin detail includes customer context, public order-number navigation, request timestamps, status history, and private notes. Admin actions are server-authorized even when controls are hidden or forged.

## Order and measurement relationship

An order-item request stores optional `orderId` and `orderItemId`, validated against the authenticated customer's order. The original order item, product snapshot, measurement snapshot, totals, and configuration are immutable. Admin views continue to use the historical stitched measurement snapshot and never load current measurements as a replacement.

## Persistence

JSON storage is version 7 with `customizationActivities` and `customizationNotes`; older stores migrate with empty collections. PostgreSQL adds request context indexes, lifecycle enum values, and append-only activity/note tables in the Phase 9 migration. Import/export and verification include these records. No binary attachments are stored: secure media storage and upload workflow remain deferred.

## Deferred work

There are no file uploads, designer tooling, quote/pricing adjustments, payment/refund changes, shipping changes, notifications, or Phase 10 features. Approved customization requests do not alter historical order prices; a future explicit quote/price-adjustment workflow is required.
