/**
 * Print routes live outside the `(app)` group so no sidebar / bottom-nav chrome
 * is rendered. The grey canvas is only a preview backdrop — `print:bg-white`
 * keeps the printed sheet clean.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-neutral-100 print:min-h-0 print:bg-white">{children}</div>;
}
