# Phase 8 — Admin Order Operations Foundation

Phase 8 adds a controlled read/write workflow around the immutable order snapshots from Phases 6C–7C. Customer order history and detail remain ownership-scoped and expose no internal notes or admin activity.

## Status lifecycle

The order statuses are `pending`, `confirmed`, `processing`, `ready`, `completed`, and `cancelled`.

Allowed transitions are:

- `pending` -> `confirmed` or `cancelled`
- `confirmed` -> `processing` or `cancelled`
- `processing` -> `ready` or `cancelled`
- `ready` -> `completed`
- `completed` and `cancelled` have no outgoing transitions

The transition graph is defined once in `src/server/orders/workflow.ts`. The admin service reads the current order server-side, validates the transition, and performs a compare-and-set update inside `Repositories.transaction()`. A stale concurrent update fails without changing the order. Customers can only see the resulting human-friendly status.

## Admin operations

Admin status actions and note creation require `orders.write` through `authorizeAdmin()`. The UI only offers valid next actions and confirms cancellation, but these controls are not the security boundary. The server validates the order number, status transition, and note length/content. No payment, refund, notification, shipping, or production workflow is included.

Order creation records `order_created`. A successful status change records `status_changed`, or `order_cancelled` for cancellation. Adding a private note records `internal_note_added`.

## Activity and notes

`OrderActivity` is append-only and stores the order reference, action type, optional status pair, optional actor reference, safe metadata, and timestamp. `OrderNote` is append-only, private to admin views, and stores the order reference, optional actor reference, author display name, body, and timestamp. There are no update/delete methods. Notes are capped at 2,000 characters and are rendered as escaped text.

The current development admin session uses the placeholder subject `dev-admin`, which is not a persisted User row. Notes therefore preserve the display author `Studio admin` and leave the optional actor foreign key empty until real admin identities exist.

## Customization and stitching

Admin order detail shows attached customization request status/details when the referenced Phase 7B request still exists. It does not add uploads or a designer workflow. Stitching continues to use the immutable measurement snapshot on each order item; current profiles are never loaded as a replacement. Historical orders without a snapshot retain the existing honest fallback.

## Storage and migration

Prisma adds the remaining order-status enum values plus `order_activities` and `order_notes` in the Phase 8 migration. JSON storage moves to version 6 and adds `orderActivities` and `orderNotes`; v5 stores migrate with both collections empty. Import, export, count, and verification scripts include the new collections.

No unrelated tables or order snapshot fields were changed. No Vercel deployment, payment integration, notification provider, or Phase 9 work is included.

## Known limitations

- There is no real admin identity table/session subject yet, so the development admin author is a display name rather than a user FK.
- There is no automated test framework in the repository; validation relies on typecheck, Prisma/schema validation, production build, store validation, and editor diagnostics.
- JSON transaction serialization is process-local, consistent with the existing provider contract; PostgreSQL supplies database isolation across processes.
