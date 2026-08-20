import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PersistentNav } from './PersistentNav.js';

// Render/interaction coverage for PersistentNav (04-ROADMAP.md Slice 1 Tests list, US-7 AC1-AC4).

afterEach(() => cleanup());

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-display">{location.pathname}</div>;
}

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <PersistentNav />
      <LocationDisplay />
      <Routes>
        <Route path="/" element={<div>home stub</div>} />
        <Route path="/departments" element={<div>departments stub</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PersistentNav', () => {
  it('renders exactly two links — Mission Control (-> /) and Departments (-> /departments) — and no others', () => {
    renderWithRouter();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Mission Control' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Departments' })).toHaveAttribute(
      'href',
      '/departments',
    );
    expect(screen.queryByRole('link', { name: /activity/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /knowledge/i })).not.toBeInTheDocument();
  });

  it('a click on a link updates the URL via client-side routing without remounting PersistentNav (US-7 AC1, AC3)', () => {
    renderWithRouter();
    const navBefore = document.querySelector('nav.persistent-nav');
    expect(navBefore).not.toBeNull();

    fireEvent.click(screen.getByRole('link', { name: 'Departments' }));

    expect(screen.getByTestId('location-display').textContent).toBe('/departments');
    expect(screen.getByText('departments stub')).toBeInTheDocument();

    // Same DOM node reference before/after navigation === PersistentNav was never unmounted and
    // remounted by the route change (a remount would produce a brand-new <nav> element).
    const navAfter = document.querySelector('nav.persistent-nav');
    expect(navAfter).toBe(navBefore);
  });
});
