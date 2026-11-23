'use strict';

for (const id of ['origen', 'destino', 'from', 'to']) {
  const input = document.getElementById(id);
  if (input) addAddressSuggestions(input);
}

function addAddressSuggestions(input) {
  const container = document.createElement('div');
  const panel = document.createElement('div');
  const choices = document.createElement('div');
  const attribution = document.createElement('a');
  container.className = 'address-field';
  panel.className = 'address-suggestions';
  panel.hidden = true;
  choices.setAttribute('role', 'group');
  choices.setAttribute('aria-label', document.documentElement.lang === 'es' ? 'Sugerencias de direcciones' : 'Address suggestions');
  attribution.href = 'https://www.openstreetmap.org/copyright';
  attribution.target = '_blank';
  attribution.rel = 'noopener noreferrer';
  attribution.textContent = '© OpenStreetMap contributors';
  input.before(container);
  container.append(input, panel);
  panel.append(choices, attribution);
  input.autocomplete = 'off';

  let timer;
  let request;
  let selectedAddress;

  function close() {
    clearTimeout(timer);
    request?.abort();
    panel.hidden = true;
    choices.replaceChildren();
  }

  input.addEventListener('input', event => {
    close();
    const query = input.value.trim();
    if (event.isComposing || query.length < 4 || query === selectedAddress) return;
    timer = setTimeout(() => search(query), 500);
  });
  input.addEventListener('compositionend', () => input.dispatchEvent(new Event('input', { bubbles: true })));
  container.addEventListener('focusout', event => {
    if (!container.contains(event.relatedTarget)) close();
  });
  container.addEventListener('keydown', event => {
    if (panel.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      input.focus();
      close();
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const buttons = [...choices.children];
      const index = buttons.indexOf(document.activeElement);
      const next = event.key === 'ArrowDown' ? buttons[index + 1] : buttons[index - 1] || input;
      if (next) {
        event.preventDefault();
        next.focus();
      }
    }
  });

  async function search(query) {
    request = new AbortController();
    const { signal } = request;
    const params = new URLSearchParams({
      q: query, countrycode: 'US', limit: '6', lat: '42.36', lon: '-71.06', zoom: '8'
    });
    try {
      const response = await fetch('https://photon.komoot.io/api/?' + params, { signal });
      if (!response.ok) return;
      const { features } = await response.json();
      if (signal.aborted || input.value.trim() !== query || document.activeElement !== input) return;
      const addresses = new Set(features.map(({ properties }) => formatAddress(properties)));
      for (const address of addresses) {
        if (!address || address.length > 200) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = address;
        button.addEventListener('pointerdown', event => event.preventDefault());
        button.addEventListener('click', () => {
          selectedAddress = input.value = address;
          input.focus();
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        choices.append(button);
      }
      panel.hidden = !choices.childElementCount;
    } catch {
      // Manual address entry remains available if the search fails.
    }
  }
}

function formatAddress({ name, housenumber, street, city, town, village, locality, state, postcode, type }) {
  const streetAddress = [housenumber, street].filter(Boolean).join(' ');
  const label = type === 'house' && streetAddress ? streetAddress : name;
  return [...new Set([label, streetAddress, city || town || village || locality, state, postcode]
    .filter(Boolean))].join(', ');
}
