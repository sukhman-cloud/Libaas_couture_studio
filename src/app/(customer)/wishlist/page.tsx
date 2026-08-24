import { redirect } from "next/navigation";

/**
 * The wishlist lives inside the customer account (it is per-customer data).
 * This public path is kept so older links and the header icon keep working.
 */
export default function WishlistRedirect() {
  redirect("/account/wishlist");
}
