import type { Metadata } from "next";
import {
  CalendarDays,
  Package,
  ShoppingBag,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getRepositories } from "@/server/data";

export const metadata: Metadata = { title: "Admin · Dashboard" };

export default async function AdminDashboardPage() {
  const repos = getRepositories();
  const [orderCount, productCount, customerCount, appointmentCount] =
    await Promise.all([
      repos.orders.count(),
      repos.products.countActive(),
      repos.customers.count(),
      repos.appointments.count(),
    ]);

  const stats = [
    { icon: ShoppingBag, label: "Orders", value: orderCount },
    { icon: Package, label: "Active products", value: productCount },
    { icon: Users, label: "Customers", value: customerCount },
    { icon: CalendarDays, label: "Appointments", value: appointmentCount },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-navy-800 sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted">
            Studio overview — live data arrives with the database phase.
          </p>
        </div>
        <Badge tone="gold">Early preview</Badge>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-4 px-4 py-4 sm:px-5 sm:py-5">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-cream-100 text-gold-600">
                <stat.icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs uppercase tracking-wider text-muted">
                  {stat.label}
                </p>
                <p className="font-display text-2xl font-semibold text-navy-800">
                  {stat.value}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
