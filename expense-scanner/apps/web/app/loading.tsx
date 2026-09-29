/** Shown instantly while a page loads on the server, so clicks feel immediate. */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-40 rounded-lg bg-line" />
      <div className="grid grid-cols-3 gap-3">
        <div className="h-20 rounded-xl bg-line/60" />
        <div className="h-20 rounded-xl bg-line/60" />
        <div className="h-20 rounded-xl bg-line/60" />
      </div>
      <div className="h-16 rounded-xl bg-line/60" />
      <div className="h-16 rounded-xl bg-line/60" />
    </div>
  );
}
