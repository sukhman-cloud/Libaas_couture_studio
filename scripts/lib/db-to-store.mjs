/**
 * Reconstruct a current-version (v5) JSON store object from a PostgreSQL database.
 *
 * Used by scripts/verify-migration.mjs (to compare the database against the
 * JSON source, entity by entity) and scripts/export-postgres-store.mjs (the
 * rollback path: a database can always be turned back into a store file the
 * JSON provider can serve).
 *
 * This module deliberately does NOT import application code — verification
 * must stay independent of the code being verified. The shape rules are the
 * same ones documented on src/server/data/postgres/mappers.ts: DateTime →
 * ISO string, BIGINT paise → number, NULL → absent key, child rows ordered
 * by `position` → embedded arrays.
 *
 * Top-level arrays are ordered by (createdAt, id) — the closest stable
 * equivalent of the JSON store's insertion order.
 */

const iso = (value) => value.toISOString();

/** Include `key` only when non-null; dates become ISO strings. */
function opt(target, key, value) {
  if (value === null || value === undefined) return target;
  target[key] = value instanceof Date ? iso(value) : value;
  return target;
}

function money(amount, currency) {
  const value = Number(amount);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Money amount out of safe integer range: ${amount}`);
  }
  return { amount: value, currency };
}

const byCreatedThenId = { orderBy: [{ createdAt: "asc" }, { id: "asc" }] };

export async function reconstructStore(prisma) {
  const [
    users,
    credentials,
    profiles,
    measurementProfiles,
    resetTokens,
    mediaAssets,
    categories,
    collections,
    products,
    carts,
    wishlists,
    orders,
    customizationRequests,
  ] = await Promise.all([
    prisma.user.findMany(byCreatedThenId),
    prisma.authCredential.findMany(byCreatedThenId),
    prisma.customerProfile.findMany({
      ...byCreatedThenId,
      include: { addresses: { orderBy: { position: "asc" } } },
    }),
    prisma.measurementProfile.findMany({
      ...byCreatedThenId,
      include: { values: { orderBy: { position: "asc" } } },
    }),
    prisma.passwordResetToken.findMany(byCreatedThenId),
    prisma.mediaAsset.findMany(byCreatedThenId),
    prisma.category.findMany(byCreatedThenId),
    prisma.collection.findMany(byCreatedThenId),
    prisma.product.findMany({
      ...byCreatedThenId,
      include: {
        secondaryCategories: { orderBy: { position: "asc" } },
        collections: { orderBy: { position: "asc" } },
        media: { orderBy: { position: "asc" } },
      },
    }),
    prisma.cart.findMany({
      ...byCreatedThenId,
      include: { items: { orderBy: { position: "asc" } } },
    }),
    prisma.wishlist.findMany({
      ...byCreatedThenId,
      include: { items: { orderBy: { position: "asc" } } },
    }),
    prisma.order.findMany({
      ...byCreatedThenId,
      include: { items: { orderBy: { position: "asc" } } },
    }),
    prisma.customizationRequest.findMany(byCreatedThenId),
  ]);

  return {
    version: 5,
    products: products.map((row) => {
      const attributes = {};
      opt(attributes, "fabric", row.fabric);
      opt(attributes, "colour", row.colour);
      opt(attributes, "occasion", row.occasion);
      opt(attributes, "work", row.work);
      opt(attributes, "fit", row.fit);
      opt(attributes, "extra", row.attributesExtra);

      const product = {
        id: row.id,
        sku: row.sku,
        slug: row.slug,
        name: row.name,
      };
      opt(product, "shortDescription", row.shortDescription);
      product.description = row.description;
      opt(product, "categoryId", row.categoryId);
      product.secondaryCategoryIds = row.secondaryCategories.map(
        (s) => s.categoryId,
      );
      product.collectionIds = row.collections.map((c) => c.collectionId);
      product.tags = row.tags;
      product.price = money(row.priceAmount, row.priceCurrency);
      if (row.salePriceAmount !== null) {
        product.salePrice = money(
          row.salePriceAmount,
          row.salePriceCurrency ?? "INR",
        );
      }
      product.status = row.status;
      product.availability = row.availability;
      product.isFeatured = row.isFeatured;
      product.attributes = attributes;
      product.stitchingAvailable = row.stitchingAvailable;
      product.customizationAvailable = row.customizationAvailable;
      product.media = row.media.map((m) => ({
        id: m.id,
        mediaId: m.mediaId,
        alt: m.alt,
        sortOrder: m.sortOrder,
        isPrimary: m.isPrimary,
        createdAt: iso(m.createdAt),
      }));
      opt(product, "archivedAt", row.archivedAt);
      product.createdAt = iso(row.createdAt);
      product.updatedAt = iso(row.updatedAt);
      return product;
    }),

    categories: categories.map((row) => {
      const category = { id: row.id, slug: row.slug, name: row.name };
      opt(category, "description", row.description);
      opt(category, "parentId", row.parentId);
      opt(category, "mediaId", row.mediaId);
      category.sortOrder = row.sortOrder;
      category.status = row.status;
      opt(category, "archivedAt", row.archivedAt);
      category.createdAt = iso(row.createdAt);
      category.updatedAt = iso(row.updatedAt);
      return category;
    }),

    collections: collections.map((row) => {
      const collection = { id: row.id, slug: row.slug, name: row.name };
      opt(collection, "description", row.description);
      opt(collection, "coverMediaId", row.coverMediaId);
      collection.sortOrder = row.sortOrder;
      collection.status = row.status;
      opt(collection, "archivedAt", row.archivedAt);
      collection.createdAt = iso(row.createdAt);
      collection.updatedAt = iso(row.updatedAt);
      return collection;
    }),

    mediaAssets: mediaAssets.map((row) => ({
      id: row.id,
      storageKey: row.storageKey,
      originalName: row.originalName,
      mimeType: row.mimeType,
      size: row.size,
      createdAt: iso(row.createdAt),
    })),

    orders: orders.map((row) => {
      const order = {
        id: row.id,
        orderNumber: row.orderNumber,
        userId: row.userId,
        status: row.status,
      };
      const customer = { name: row.customerName };
      opt(customer, "email", row.customerEmail);
      opt(customer, "phone", row.customerPhone);
      order.customer = customer;
      const shippingAddress = {
        fullName: row.shipFullName,
        phone: row.shipPhone,
        line1: row.shipLine1,
      };
      opt(shippingAddress, "line2", row.shipLine2);
      opt(shippingAddress, "locality", row.shipLocality);
      shippingAddress.city = row.shipCity;
      shippingAddress.state = row.shipState;
      shippingAddress.postalCode = row.shipPostalCode;
      shippingAddress.country = row.shipCountry;
      order.shippingAddress = shippingAddress;
      order.items = row.items.map((item) => {
        const line = {
          id: item.id,
          productId: item.productId,
          nameSnapshot: item.nameSnapshot,
          slugSnapshot: item.slugSnapshot,
          quantity: item.quantity,
          unitPrice: money(item.unitPriceAmount, item.currency),
          lineSubtotal: money(item.lineSubtotalAmount, item.currency),
          configurationKey: item.configurationKey,
        };
        if (item.stitching !== null) line.stitching = item.stitching;
        opt(line, "customizationRequestId", item.customizationRequestId);
        opt(line, "notes", item.notes);
        return line;
      });
      order.currency = row.currency;
      order.subtotal = money(row.subtotalAmount, row.currency);
      order.shippingAmount = money(row.shippingAmount, row.currency);
      order.taxAmount = money(row.taxAmount, row.currency);
      order.discountAmount = money(row.discountAmount, row.currency);
      order.total = money(row.totalAmount, row.currency);
      order.idempotencyKey = row.idempotencyKey;
      order.requestFingerprint = row.requestFingerprint;
      order.createdAt = iso(row.createdAt);
      order.updatedAt = iso(row.updatedAt);
      return order;
    }),
    appointments: [],

    customizationRequests: customizationRequests.map((row) => {
      const request = { id: row.id, userId: row.userId };
      opt(request, "productId", row.productId);
      opt(request, "measurementProfileId", row.measurementProfileId);
      request.details = row.details;
      request.status = row.status;
      request.createdAt = iso(row.createdAt);
      request.updatedAt = iso(row.updatedAt);
      return request;
    }),

    users: users.map((row) => {
      const user = { id: row.id, kind: row.kind, name: row.name };
      opt(user, "email", row.email);
      opt(user, "phone", row.phone);
      user.isActive = row.isActive;
      user.createdAt = iso(row.createdAt);
      user.updatedAt = iso(row.updatedAt);
      return user;
    }),

    credentials: credentials.map((row) => ({
      id: row.id,
      userId: row.userId,
      passwordHash: row.passwordHash,
      sessionVersion: row.sessionVersion,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    })),

    customerProfiles: profiles.map((row) => {
      const profile = { id: row.id, userId: row.userId };
      opt(profile, "defaultAddressId", row.defaultAddressId);
      profile.addresses = row.addresses.map((a) => {
        const address = {
          id: a.id,
          label: a.label,
          fullName: a.fullName,
          phone: a.phone,
          line1: a.line1,
        };
        opt(address, "line2", a.line2);
        opt(address, "locality", a.locality);
        address.city = a.city;
        address.state = a.state;
        address.postalCode = a.postalCode;
        address.country = a.country;
        return address;
      });
      profile.acceptsMarketing = row.acceptsMarketing;
      profile.createdAt = iso(row.createdAt);
      profile.updatedAt = iso(row.updatedAt);
      return profile;
    }),

    measurementProfiles: measurementProfiles.map((row) => {
      const profile = {
        id: row.id,
        userId: row.userId,
        label: row.label,
        unit: row.unit,
        values: row.values.map((v) => ({ key: v.key, value: v.value })),
      };
      opt(profile, "fitPreference", row.fitPreference);
      opt(profile, "notes", row.notes);
      profile.isDefault = row.isDefault;
      opt(profile, "archivedAt", row.archivedAt);
      profile.createdAt = iso(row.createdAt);
      profile.updatedAt = iso(row.updatedAt);
      return profile;
    }),

    passwordResetTokens: resetTokens.map((row) => {
      const token = {
        id: row.id,
        userId: row.userId,
        tokenHash: row.tokenHash,
        expiresAt: iso(row.expiresAt),
      };
      opt(token, "usedAt", row.usedAt);
      token.createdAt = iso(row.createdAt);
      return token;
    }),

    carts: carts.map((row) => ({
      id: row.id,
      userId: row.userId,
      items: row.items.map((item) => {
        const line = {
          id: item.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: money(item.unitPriceAmount, item.unitPriceCurrency),
          configurationKey: item.configurationKey,
        };
        if (item.stitching !== null) line.stitching = item.stitching;
        opt(line, "customizationRequestId", item.customizationRequestId);
        opt(line, "notes", item.notes);
        line.createdAt = iso(item.createdAt);
        line.updatedAt = iso(item.updatedAt);
        return line;
      }),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    })),

    wishlists: wishlists.map((row) => ({
      id: row.id,
      userId: row.userId,
      items: row.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        createdAt: iso(item.createdAt),
      })),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    })),
  };
}

/** Row counts for every table, used by both the importer and the verifier. */
export async function countAll(prisma) {
  const [
    users,
    credentials,
    customerProfiles,
    customerAddresses,
    measurementProfiles,
    measurementValues,
    passwordResetTokens,
    mediaAssets,
    categories,
    collections,
    products,
    productSecondaryCategories,
    productCollections,
    productMedia,
    carts,
    cartItems,
    wishlists,
    wishlistItems,
    orders,
    orderItems,
    customizationRequests,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.authCredential.count(),
    prisma.customerProfile.count(),
    prisma.customerAddress.count(),
    prisma.measurementProfile.count(),
    prisma.measurementValue.count(),
    prisma.passwordResetToken.count(),
    prisma.mediaAsset.count(),
    prisma.category.count(),
    prisma.collection.count(),
    prisma.product.count(),
    prisma.productSecondaryCategory.count(),
    prisma.productCollection.count(),
    prisma.productMedia.count(),
    prisma.cart.count(),
    prisma.cartItem.count(),
    prisma.wishlist.count(),
    prisma.wishlistItem.count(),
    prisma.order.count(),
    prisma.orderItem.count(),
    prisma.customizationRequest.count(),
  ]);
  return {
    users,
    credentials,
    customerProfiles,
    customerAddresses,
    measurementProfiles,
    measurementValues,
    passwordResetTokens,
    mediaAssets,
    categories,
    collections,
    products,
    productSecondaryCategories,
    productCollections,
    productMedia,
    carts,
    cartItems,
    wishlists,
    wishlistItems,
    orders,
    orderItems,
    customizationRequests,
  };
}
