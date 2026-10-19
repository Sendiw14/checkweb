/** Re-mounts on every navigation, replaying a short CSS enter animation (no JS, no layout shift). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
