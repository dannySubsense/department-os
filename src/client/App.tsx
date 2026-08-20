import { Routes, Route } from 'react-router-dom';
import { PersistentNav } from './components/PersistentNav.js';
import { MissionControlScreen } from './screens/MissionControlScreen.js';

/** Client-side router — exactly three route paths this checkpoint (§6), no catch-all. Only `/`
 *  renders its real screen this slice; the other two render a minimal, honest inline
 *  "not built yet this slice" placeholder (Slices 2 and 3 replace these bodies without touching
 *  the route declarations themselves). `PersistentNav` is mounted once here, as a sibling to
 *  `<Routes>`, so it is never remounted on navigation (§2, US-7 AC1). */
export function App() {
  return (
    <div className="app-shell">
      <PersistentNav />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<MissionControlScreen />} />
          <Route
            path="/departments"
            element={<div className="stub-screen">Departments — not built yet this slice.</div>}
          />
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
