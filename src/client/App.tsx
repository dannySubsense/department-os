import { Routes, Route } from 'react-router-dom';
import { PersistentNav } from './components/PersistentNav.js';
import { MissionControlScreen } from './screens/MissionControlScreen.js';

/** Client-side router — exactly two route paths this checkpoint (§6, §0a), no catch-all, no
 *  `/departments` catalog route. Only `/` renders its real screen this slice; the other route
 *  renders a minimal, honest inline "not built yet this slice" placeholder (Slice 2 replaces this
 *  body without touching the route declaration itself). `PersistentNav` is mounted once here, as
 *  a sibling to `<Routes>`, so it is never remounted on navigation (§2, US-7 AC1). */
export function App() {
  return (
    <div className="app-shell">
      <PersistentNav />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<MissionControlScreen />} />
          <Route
            path="/departments/problem-department"
            element={
              <div className="stub-screen">Problem Department — not built yet this slice.</div>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
