import { NavLink } from 'react-router-dom';

/** Persistent left-nav, mounted once at the `App` shell level (§2, US-7). Renders exactly two
 *  links this checkpoint — no `/activity` or `/knowledge` link (those routes are not built this
 *  checkpoint). Presentational only — no data fetching. */
export function PersistentNav() {
  return (
    <nav className="persistent-nav">
      <div className="persistent-nav__brand">Department OS</div>
      <ul className="persistent-nav__links">
        <li>
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              isActive ? 'persistent-nav__link persistent-nav__link--active' : 'persistent-nav__link'
            }
          >
            Mission Control
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/departments/problem-department"
            className={({ isActive }) =>
              isActive ? 'persistent-nav__link persistent-nav__link--active' : 'persistent-nav__link'
            }
          >
            Problem Department
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}
