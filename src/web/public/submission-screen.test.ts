// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderSubmissionScreen } from '../views.js';

// submission-screen.js is a plain IIFE browser script (not an ES module export) — it wires up
// its behavior against `document` at import time. Reset the module registry per test so a fresh
// import re-runs the IIFE against a fresh DOM (03-UI-SPEC.md "Interactions > Add/remove source
// artifact row" and "Submit sources").
//
// The DOM here is derived from the real renderSubmissionScreen() output (views.ts), not a
// hand-written replica — a hand-copied fixture can silently drift from the actual server-rendered
// markup (e.g. a changed default `kind`) without any test noticing. Parsing the real HTML string
// and lifting its <body> contents ties this fixture to the actual implementation: a future change
// to the real markup is either reflected automatically or breaks these tests loudly.
function setDom(): void {
  const html = renderSubmissionScreen();
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.body.innerHTML = parsed.body.innerHTML;
}

async function loadScript(): Promise<void> {
  vi.resetModules();
  setDom();
  await import('./submission-screen.js');
}

function rowsContainer(): HTMLElement {
  return document.getElementById('source-artifact-rows') as HTMLElement;
}

function submitControl(): HTMLButtonElement {
  return document.getElementById('submit-control') as HTMLButtonElement;
}

function firstRawInput(): HTMLInputElement | HTMLTextAreaElement {
  return rowsContainer().querySelector('[name="raw"]') as HTMLInputElement | HTMLTextAreaElement;
}

describe('submission-screen.js', () => {
  beforeEach(() => {
    setDom();
  });

  it('adds a new row when "add-row" is clicked', async () => {
    await loadScript();
    expect(rowsContainer().children.length).toBe(1);

    (document.getElementById('add-row') as HTMLButtonElement).click();

    expect(rowsContainer().children.length).toBe(2);
  });

  it('clears the last remaining row instead of removing it, and re-disables submit', async () => {
    await loadScript();
    const textarea = firstRawInput();
    textarea.value = 'some content';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    expect(submitControl().disabled).toBe(false);

    (rowsContainer().querySelector('.remove-row') as HTMLButtonElement).click();

    expect(rowsContainer().children.length).toBe(1);
    expect(firstRawInput().value).toBe('');
    expect(submitControl().disabled).toBe(true);
  });

  it('enables the submit control once at least one row has content', async () => {
    await loadScript();
    const textarea = firstRawInput();

    expect(submitControl().disabled).toBe(true);

    textarea.value = 'https://example.com';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    expect(submitControl().disabled).toBe(false);

    textarea.value = '';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    expect(submitControl().disabled).toBe(true);
  });

  it('starts a row with a URL input matching the default "url" kind', async () => {
    await loadScript();
    const row = rowsContainer().querySelector('.source-artifact-row') as HTMLElement;
    expect(row.querySelector('input[type="url"][name="raw"]')).not.toBeNull();
    expect(row.querySelector('textarea[name="raw"]')).toBeNull();
  });

  it('swaps the input to a textarea when the kind selector is changed to Text, preserving content', async () => {
    await loadScript();
    const row = rowsContainer().querySelector('.source-artifact-row') as HTMLElement;
    const select = row.querySelector('select[name="type"]') as HTMLSelectElement;
    const urlInput = row.querySelector('input[name="raw"]') as HTMLInputElement;
    urlInput.value = 'https://example.com';

    select.value = 'text';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const textarea = row.querySelector('textarea[name="raw"]') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    expect(row.querySelector('input[name="raw"]')).toBeNull();
    expect(textarea.value).toBe('https://example.com');
  });

  it('swaps the input back to a URL input when the kind selector is changed back to URL', async () => {
    await loadScript();
    const row = rowsContainer().querySelector('.source-artifact-row') as HTMLElement;
    const select = row.querySelector('select[name="type"]') as HTMLSelectElement;

    select.value = 'text';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.value = 'url';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(row.querySelector('input[type="url"][name="raw"]')).not.toBeNull();
    expect(row.querySelector('textarea[name="raw"]')).toBeNull();
  });

  it('adds new rows with a URL input by default', async () => {
    await loadScript();
    (document.getElementById('add-row') as HTMLButtonElement).click();
    const rows = rowsContainer().querySelectorAll('.source-artifact-row');
    const secondRow = rows[1] as HTMLElement;
    expect(secondRow.querySelector('input[type="url"][name="raw"]')).not.toBeNull();
  });

  it('disables the submit control and marks it busy while the request is in flight', async () => {
    await loadScript();
    const textarea = firstRawInput();
    textarea.value = 'https://example.com';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    expect(submitControl().disabled).toBe(false);

    document
      .getElementById('submission-form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(submitControl().disabled).toBe(true);
    expect(submitControl().getAttribute('aria-busy')).toBe('true');
    expect(submitControl().textContent).toBe('Submitting…');
  });
});
