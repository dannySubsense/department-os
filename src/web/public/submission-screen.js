// Minimal client-side behavior for the Submission Screen (03-UI-SPEC.md
// "Interactions > Add/remove source artifact row" and "Submit sources").
(function () {
  const rowsContainer = document.getElementById('source-artifact-rows');
  const addRowButton = document.getElementById('add-row');
  const submitControl = document.getElementById('submit-control');
  const form = document.getElementById('submission-form');

  // Input matching the selected kind (03-UI-SPEC.md "Submission Screen" layout diagram:
  // "[ input matching kind ]") — a single-line URL input for 'url', a multi-line textarea for
  // 'text'. Both share name="raw" so the server-side form parser needs no branching.
  function rawInputHtml(type) {
    if (type === 'text') {
      return '<textarea name="raw" placeholder="Paste text"></textarea>';
    }
    return '<input type="url" name="raw" placeholder="Paste a URL" />';
  }

  function makeRow() {
    const row = document.createElement('div');
    row.className = 'source-artifact-row';
    row.innerHTML = [
      '<select name="type">',
      '<option value="url">URL</option>',
      '<option value="text">Text</option>',
      '</select>',
      rawInputHtml('url'),
      '<button type="button" class="remove-row" aria-label="Remove source">x</button>',
    ].join('');
    return row;
  }

  // When the kind selector changes on an existing row, swap the raw input element to match
  // (preserving any content already entered) instead of only fixing the default/new-row case.
  function swapRawInputForKind(select) {
    const row = select.closest('.source-artifact-row');
    if (!row) return;
    const oldInput = row.querySelector('[name="raw"]');
    const previousValue = oldInput ? oldInput.value : '';
    const wrapper = document.createElement('div');
    wrapper.innerHTML = rawInputHtml(select.value);
    const newInput = wrapper.firstElementChild;
    newInput.value = previousValue;
    if (oldInput) {
      oldInput.replaceWith(newInput);
    } else {
      row.insertBefore(newInput, row.querySelector('.remove-row'));
    }
  }

  function recalcSubmitEnabled() {
    const inputs = rowsContainer.querySelectorAll('[name="raw"]');
    let hasContent = false;
    inputs.forEach((el) => {
      if (el.value.trim().length > 0) hasContent = true;
    });
    submitControl.disabled = !hasContent;
  }

  addRowButton.addEventListener('click', () => {
    rowsContainer.appendChild(makeRow());
    recalcSubmitEnabled();
  });

  rowsContainer.addEventListener('click', (event) => {
    const target = event.target;
    if (target && target.classList && target.classList.contains('remove-row')) {
      const row = target.closest('.source-artifact-row');
      if (row && rowsContainer.children.length > 1) {
        row.remove();
      } else if (row) {
        // keep at least one row, but clear it
        const input = row.querySelector('[name="raw"]');
        if (input) input.value = '';
      }
      recalcSubmitEnabled();
    }
  });

  rowsContainer.addEventListener('change', (event) => {
    const target = event.target;
    if (target && target.tagName === 'SELECT' && target.name === 'type') {
      swapRawInputForKind(target);
      recalcSubmitEnabled();
    }
  });

  rowsContainer.addEventListener('input', recalcSubmitEnabled);

  if (form) {
    form.addEventListener('submit', () => {
      // Do not disable the input fields here: disabled inputs are excluded from the submitted
      // payload, which would silently drop the entered content. The submit button itself holds
      // no payload value, so disabling it is safe and required — it prevents a double-click
      // from firing two submissions (and creating two Investigations) while the request is
      // in flight. This is a plain form submission (full page navigation): a successful submit
      // redirects away, and an error response re-renders the whole page from the server
      // (submit control defaults back to its server-rendered disabled state) — so there is no
      // client-side re-enable path to write.
      submitControl.disabled = true;
      submitControl.setAttribute('aria-busy', 'true');
      submitControl.textContent = 'Submitting…';
    });
  }

  recalcSubmitEnabled();
})();
