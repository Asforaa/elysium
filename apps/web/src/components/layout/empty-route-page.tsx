import type { SidebarItemTitle } from "@/app/types";

export function EmptyRoutePage({ title }: { title: SidebarItemTitle }) {
  return (
    <section className="rounded-xl border bg-card p-6 text-card-foreground">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This section is ready for future Elysium features.
      </p>
    </section>
  );
}
