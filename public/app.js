const form = document.getElementById('lookup-form');
const usernameInput = document.getElementById('username');
const statusMessage = document.getElementById('status-message');
const reportSection = document.getElementById('report');
const shareButton = document.getElementById('share-report');
const shareButtonBottom = document.getElementById('share-report-bottom');

const chartRefs = {};
let lastUsername = '';
let lastReport = null;

const COUNTRY_NAMES = {
  US: 'United States', GB: 'United Kingdom', FR: 'France', DE: 'Germany',
  JP: 'Japan', KR: 'South Korea', IT: 'Italy', ES: 'Spain', CA: 'Canada',
  AU: 'Australia', NZ: 'New Zealand', BR: 'Brazil', MX: 'Mexico', IN: 'India',
  CN: 'China', SE: 'Sweden', DK: 'Denmark', NO: 'Norway', FI: 'Finland',
  IE: 'Ireland', AT: 'Austria', CH: 'Switzerland', BE: 'Belgium', NL: 'Netherlands',
  PL: 'Poland', CZ: 'Czech Republic', RU: 'Russia', AR: 'Argentina', TH: 'Thailand',
  HK: 'Hong Kong', TW: 'Taiwan', PH: 'Philippines', ZA: 'South Africa',
  TR: 'Turkey', GR: 'Greece', PT: 'Portugal', RO: 'Romania', HU: 'Hungary',
  IL: 'Israel', EG: 'Egypt', NG: 'Nigeria', CO: 'Colombia', CL: 'Chile',
  PE: 'Peru', IR: 'Iran', PK: 'Pakistan', UA: 'Ukraine', ID: 'Indonesia',
};

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim();
  if (!username) return;

  setStatus('Loading...');
  toggleReport(false);

  try {
    const report = await fetchReport(username);
    lastUsername = username;
    lastReport = report;
    updateUrl(username);
    renderReport(report);
    setStatus('');
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Something went wrong', 'error');
  }
});

shareButton.addEventListener('click', shareReport);
if (shareButtonBottom) {
  shareButtonBottom.addEventListener('click', shareReport);
}

async function fetchReport(username) {
  const response = await fetch(`/api/report/${encodeURIComponent(username)}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || 'Unable to generate report');
  }
  return response.json();
}

function renderReport(data) {
  document.getElementById('films-watched').textContent = data.totals.filmsWatched;
  document.getElementById('average-rating').textContent = data.totals.averageRating ?? '—';

  renderDecadeChart(data);
  renderGenreChart(data);
  renderCountryChart(data);

  renderTakesList('underrated-list', data.controversialTakes.underrated);
  renderTakesList('overrated-list', data.controversialTakes.overrated);
  renderDirectorTable(data.directors);

  // Clear any open detail panels
  document.querySelectorAll('.chart-detail').forEach((el) => el.classList.add('hidden'));

  toggleReport(true);
}

// -- Charts with click-to-expand --

function getFilmsForDecade(data, decade) {
  return data._allFilms.filter((f) => {
    if (!f.releaseYear) return false;
    const d = Math.floor(f.releaseYear / 10) * 10 + 's';
    return d === decade;
  });
}

function getFilmsForGenre(data, genre) {
  return data._allFilms.filter((f) => f.genres && f.genres.includes(genre));
}

function getFilmsForCountry(data, countryCode) {
  return data._allFilms.filter((f) => f.countries && f.countries.includes(countryCode));
}

function renderDecadeChart(data) {
  const allLabels = [...data.decadeHistogram.labels].reverse();
  const allValues = [...data.decadeHistogram.data].reverse();

  // Find first and last decades with films, keep everything in between
  let first = allValues.findIndex((v) => v > 0);
  let last = allValues.length - 1;
  while (last > first && allValues[last] === 0) last--;

  const labels = first >= 0 ? allLabels.slice(first, last + 1) : allLabels;
  const values = first >= 0 ? allValues.slice(first, last + 1) : allValues;

  renderBarChart('decade-chart', labels, values, '#2d2d2d', (label) => {
    showDetail('decade-detail', label, getFilmsForDecade(data, label));
  });
}

function renderGenreChart(data) {
  const labels = data.genreBreakdown.slice(0, 8).map((g) => g.genre);
  const values = data.genreBreakdown.slice(0, 8).map((g) => g.count);
  renderBarChart('genre-chart', labels, values, '#2d2d2d', (label) => {
    showDetail('genre-detail', label, getFilmsForGenre(data, label));
  });
}

function renderCountryChart(data) {
  const codes = data.countryDiversity.topCountries.map((c) => c.country);
  const labels = codes.map((c) => COUNTRY_NAMES[c] || c);
  const values = data.countryDiversity.topCountries.map((c) => c.count);
  renderBarChart('country-chart', labels, values, '#2d2d2d', (label) => {
    const code = codes[labels.indexOf(label)];
    showDetail('country-detail', label, getFilmsForCountry(data, code));
  });
}

function renderBarChart(id, labels, data, color, onClick) {
  destroyChart(id);
  const ctx = document.getElementById(id).getContext('2d');
  chartRefs[id] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.length ? labels : ['—'],
      datasets: [{
        data: labels.length ? data : [0],
        backgroundColor: color,
        borderWidth: 0,
        borderRadius: 0,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: '#888', font: { size: 10 } },
          grid: { color: '#eee' },
          beginAtZero: true,
        },
        y: {
          ticks: { color: '#1a1a1a', font: { size: 11 } },
          grid: { display: false },
        },
      },
      onClick: (_event, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        const label = labels[idx];
        if (label && onClick) onClick(label);
      },
    },
  });
}

function showDetail(containerId, label, films) {
  const container = document.getElementById(containerId);

  // Toggle off if same label clicked again
  if (!container.classList.contains('hidden') && container.dataset.label === label) {
    container.classList.add('hidden');
    return;
  }

  container.dataset.label = label;

  const sorted = [...films].sort((a, b) => (b.rating || 0) - (a.rating || 0));

  let html = `<div class="chart-detail-header">
    <span>${label} (${films.length})</span>
    <button class="chart-detail-close" onclick="this.closest('.chart-detail').classList.add('hidden')">&times;</button>
  </div><ul class="chart-detail-list">`;

  sorted.forEach((f) => {
    const poster = f.posterUrl || placeholderPoster();
    const rating = typeof f.rating === 'number' ? '★'.repeat(Math.floor(f.rating)) + (f.rating % 1 ? '½' : '') : '';
    html += `<li>
      <img src="${poster}" alt="" />
      <span class="film-title">${f.title}</span>
      <span class="film-year">${f.releaseYear || ''}</span>
      <span class="film-rating">${rating}</span>
    </li>`;
  });

  html += '</ul>';
  container.innerHTML = html;
  container.classList.remove('hidden');
}

// -- Controversial takes with posters --

function renderTakesList(targetId, items) {
  const list = document.getElementById(targetId);
  list.innerHTML = '';

  if (!items.length) {
    list.innerHTML = '<li>No data</li>';
    return;
  }

  items.forEach((film) => {
    const li = document.createElement('li');
    const tmdbRating = (film.tmdbRatingFive ?? 0).toFixed(1);
    const diff = film.diff.toFixed(1);
    const diffClass = film.diff >= 0 ? 'diff-positive' : 'diff-negative';
    const diffLabel = film.diff >= 0 ? `+${diff}` : diff;
    const poster = film.posterUrl || placeholderPoster();
    li.innerHTML = `
      <img src="${poster}" alt="" class="take-poster" />
      <div class="take-info">
        <div class="take-title">${film.title}${film.releaseYear ? ` (${film.releaseYear})` : ''}</div>
        <div class="take-ratings">your rating: ${film.rating?.toFixed(1) ?? '—'} ★<br>average rating: ${tmdbRating} ★</div>
      </div>
      <div class="take-diff ${diffClass}">${diffLabel}</div>
    `;
    list.appendChild(li);
  });
}

function renderDirectorTable(directors) {
  const tbody = document.getElementById('director-table');
  tbody.innerHTML = '';

  if (!directors.length) {
    tbody.innerHTML = '<tr><td colspan="3">No data</td></tr>';
    return;
  }

  directors.forEach((director) => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.innerHTML = `<td>${director.name}</td>
      <td>${director.count}</td>
      <td>${director.averageRating ?? '—'}</td>`;

    const detailRow = document.createElement('tr');
    detailRow.classList.add('director-detail-row', 'hidden');
    detailRow.innerHTML = '<td colspan="3"></td>';

    tr.addEventListener('click', () => {
      if (!detailRow.classList.contains('hidden')) {
        detailRow.classList.add('hidden');
        return;
      }
      // Collapse any other open detail rows
      tbody.querySelectorAll('.director-detail-row').forEach((r) => r.classList.add('hidden'));

      const films = getFilmsForDirector(director.name);
      const sorted = [...films].sort((a, b) => (b.rating || 0) - (a.rating || 0));
      const cell = detailRow.querySelector('td');

      let html = '<ul class="chart-detail-list">';
      sorted.forEach((f) => {
        const poster = f.posterUrl || placeholderPoster();
        const rating = typeof f.rating === 'number' ? '★'.repeat(Math.floor(f.rating)) + (f.rating % 1 ? '½' : '') : '';
        html += `<li>
          <img src="${poster}" alt="" />
          <span class="film-title">${f.title}</span>
          <span class="film-year">${f.releaseYear || ''}</span>
          <span class="film-rating">${rating}</span>
        </li>`;
      });
      html += '</ul>';
      cell.innerHTML = html;
      detailRow.classList.remove('hidden');
    });

    tbody.appendChild(tr);
    tbody.appendChild(detailRow);
  });
}

function getFilmsForDirector(name) {
  if (!lastReport || !lastReport._allFilms) return [];
  return lastReport._allFilms.filter((f) => f.directors && f.directors.includes(name));
}

function destroyChart(id) {
  if (chartRefs[id]) {
    chartRefs[id].destroy();
    chartRefs[id] = null;
  }
}

function toggleReport(visible) {
  reportSection.classList.toggle('hidden', !visible);
}

function setStatus(message, variant = 'info') {
  if (!message) {
    statusMessage.classList.add('hidden');
    return;
  }
  statusMessage.textContent = message;
  statusMessage.classList.remove('hidden', 'error', 'success');
  if (variant === 'error') statusMessage.classList.add('error');
  if (variant === 'success') statusMessage.classList.add('success');
}

function shareReport(event) {
  if (event) event.preventDefault();
  if (!lastUsername) return;

  const url = new URL(window.location.href);
  url.searchParams.set('user', lastUsername);

  if (navigator.share) {
    navigator.share({ title: 'Letterboxd Wrapped', url: url.toString() }).catch(() => {});
  } else {
    navigator.clipboard
      .writeText(url.toString())
      .then(() => setStatus('Link copied', 'success'))
      .catch(() => setStatus('Copy failed', 'error'));
  }
}

function updateUrl(username) {
  const url = new URL(window.location.href);
  url.searchParams.set('user', username);
  window.history.replaceState({}, '', url);
}

function hydrateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const username = params.get('user');
  if (username) {
    usernameInput.value = username;
    form.dispatchEvent(new Event('submit'));
  }
}

hydrateFromUrl();

function placeholderPoster() {
  return 'https://s.ltrbxd.com/static/img/empty-poster-70-BSf-Pjrh.png';
}
