const form = document.getElementById('lookup-form');
const usernameInput = document.getElementById('username');
const statusMessage = document.getElementById('status-message');
const reportSection = document.getElementById('report');
const shareButton = document.getElementById('share-report');
const shareButtonBottom = document.getElementById('share-report-bottom');

const chartRefs = {};
let lastUsername = '';

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim();
  if (!username) return;

  setStatus(`Generating report for @${username}...`);
  toggleReport(false);

  try {
    const report = await fetchReport(username);
    lastUsername = username;
    updateUrl(username);
    renderReport(report);
    setStatus(`Report ready for @${username}!`, 'success');
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
  document.getElementById('watchlist-size').textContent = data.totals.watchlistSize;

  renderDecadeChart(data.decadeHistogram);
  renderGenreChart(data.genreBreakdown);
  renderCountryChart(data.countryDiversity);

  renderControversialList('underrated-list', data.controversialTakes.underrated, '▲');
  renderControversialList('overrated-list', data.controversialTakes.overrated, '▼');
  renderDirectorTable(data.directors);
  renderRecommendations(data.recommendations);

  toggleReport(true);
}

function renderDecadeChart(decadeData) {
  const labels = [...decadeData.labels].reverse();
  const data = [...decadeData.data].reverse();
  renderHorizontalBarChart('decade-chart', labels, data, {
    backgroundColor: 'rgba(255, 127, 17, 0.6)',
    borderColor: 'rgba(255, 127, 17, 1)',
  });
}

function renderGenreChart(genres) {
  const labels = genres.slice(0, 8).map((item) => item.genre);
  const data = genres.slice(0, 8).map((item) => item.count);
  renderHorizontalBarChart('genre-chart', labels, data, {
    backgroundColor: 'rgba(249, 115, 22, 0.8)',
    borderColor: '#fb923c',
  });
}

function renderCountryChart(countryData) {
  const labels = countryData.topCountries.map((entry) => entry.country);
  const data = countryData.topCountries.map((entry) => entry.count);
  renderHorizontalBarChart('country-chart', labels, data, {
    backgroundColor: '#34d399',
    borderColor: '#10b981',
  });
}

function renderControversialList(targetId, items, symbol) {
  const list = document.getElementById(targetId);
  list.innerHTML = '';

  if (!items.length) {
    list.innerHTML = '<li>No data yet</li>';
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
      <img src="${poster}" alt="${film.title} poster" class="controversial-poster"/>
      <div class="controversial-body">
        <div class="controversial-title">${film.title}</div>
        <div class="controversial-meta">
          <span>${film.rating?.toFixed(1) ?? '—'} ★ vs avg ${tmdbRating} ★</span>
          <span class="${diffClass}">(${diffLabel})</span>
        </div>
      </div>
    `;
    list.appendChild(li);
  });
}

function renderDirectorTable(directors) {
  const tbody = document.getElementById('director-table');
  tbody.innerHTML = '';

  if (!directors.length) {
    tbody.innerHTML = `<tr><td colspan="3">No director stats yet</td></tr>`;
    return;
  }

  directors.forEach((director) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${director.name}</td>
      <td>${director.count}</td>
      <td>${director.averageRating ?? '—'}</td>`;
    tbody.appendChild(tr);
  });
}

function renderRecommendations(recommendations) {
  const container = document.getElementById('recommendations');
  container.innerHTML = '';

  if (!recommendations.length) {
    container.innerHTML =
      '<p>No watchlist recommendations yet. Make sure your watchlist is public.</p>';
    return;
  }

  recommendations.forEach((film) => {
    const poster = film.posterUrl || placeholderPoster();
    const match = Math.round((film.score || 0) * 100);
    const link = film.letterboxdUrl || '#';
    const disabled = link === '#';
    container.innerHTML += `<article class="recommendation-card">
        <a class="recommendation-link${disabled ? ' disabled' : ''}" href="${link}" ${
          disabled ? '' : 'target="_blank" rel="noopener noreferrer"'
        }>
          <img src="${poster}" alt="${film.title} poster" />
          <div class="poster-overlay">
            <span>Open in Letterboxd</span>
          </div>
        </a>
        <span class="match-pill">Match ${match}%</span>
      </article>`;
  });
}

function renderHorizontalBarChart(id, labels, data, colors = {}) {
  destroyChart(id);
  const ctx = document.getElementById(id).getContext('2d');
  const safeLabels = labels.length ? labels : ['No data'];
  const safeData = labels.length ? data : [0];
  chartRefs[id] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: safeLabels,
      datasets: [
        {
          data: safeData,
          borderRadius: 10,
          backgroundColor: colors.backgroundColor || 'rgba(59, 130, 246, 0.6)',
          borderColor: colors.borderColor || 'rgba(59, 130, 246, 1)',
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          ticks: { color: '#9fb0c7' },
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          beginAtZero: true,
        },
        y: {
          ticks: { color: '#f6f6f3' },
          grid: { display: false },
        },
      },
    },
  });
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
  statusMessage.textContent = message;
  statusMessage.classList.remove('hidden', 'error', 'success');
  if (variant === 'error') statusMessage.classList.add('error');
  if (variant === 'success') statusMessage.classList.add('success');
  statusMessage.classList.remove('hidden');
}

function shareReport() {
  if (!lastUsername) {
    setStatus('Generate a report first!', 'error');
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set('user', lastUsername);

  if (navigator.share) {
    navigator
      .share({
        title: 'Letterboxd Wrapped',
        text: `Check out @${lastUsername}'s Letterboxd Wrapped`,
        url: url.toString(),
      })
      .catch(() => {});
  } else {
    navigator.clipboard
      .writeText(url.toString())
      .then(() => setStatus('Share link copied to clipboard!', 'success'))
      .catch(() => setStatus('Unable to copy share link', 'error'));
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
