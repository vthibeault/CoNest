import { Wordmark } from "@/components/brand";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Wordmark className="text-2xl" />
          <p className="text-balance text-sm text-muted-foreground">
            A calm, shared home for your family&rsquo;s schedule across two
            homes.
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
