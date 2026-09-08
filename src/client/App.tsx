import { Routes, Route } from 'react-router-dom';
import { PersistentNav } from './components/PersistentNav.js';
import { MissionControlScreen } from './screens/MissionControlScreen.js';
import { ProblemDepartmentScreen } from './screens/ProblemDepartmentScreen.js';
import { InvestigationWorkspaceScreen } from './screens/InvestigationWorkspaceScreen.js';

/** Client-side router — no catch-all, no `/departments` catalog route. `PersistentNav` is mounted
 *  once here, as a sibling to `<Routes>`, so it is never remounted on navigation (§2, US-7 AC1).
 *  The two `/investigations/:investigationId` routes (with and without `/versions/:versionNumber`,
 *  §5.1, C2-S4) render the SAME `InvestigationWorkspaceScreen` — the versioned route is not a
 *  distinct screen, it is the same workspace told which version to display via `useParams`. */
export function App() {
  return (
    <div className="app-shell">
      <PersistentNav />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<MissionControlScreen />} />
          <Route
            path="/departments/problem-department"
            element={<ProblemDepartmentScreen />}
          />
          <Route
            path="/departments/problem-department/investigations/:investigationId"
            element={<InvestigationWorkspaceScreen />}
          />
          <Route
            path="/departments/problem-department/investigations/:investigationId/versions/:versionNumber"
            element={<InvestigationWorkspaceScreen />}
          />
        </Routes>
      </main>
    </div>
  );
}
