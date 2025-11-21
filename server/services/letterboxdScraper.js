const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://letterboxd.com';
const USER_AGENT =
  'Letterboxd Wrapped Bot/1.0 (+https://github.com/user/letterboxd-wrapped)';
const REQUEST_TIMEOUT = 15000;

const http = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    'User-Agent': USER_AGENT,
  },
});

const DEFAULT_MAX_FILMS = 400;
const DEFAULT_MAX_WATCHLIST = 200;

async function fetchCollection(username, section, limit) {
  const safeUser = encodeURIComponent(username.trim());
  const items = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && items.length < limit) {
    const url =
      page === 1 ? `/${safeUser}/${section}/` : `/${safeUser}/${section}/page/${page}/`;
    const html = await fetchHtml(url);
    if (!html) {
      if (page === 1) {
        throw new Error('USER_OR_SECTION_NOT_FOUND');
      }
      break;
    }

    const films = parseFilms(html);
    if (!films.length) {
      hasMore = false;
      break;
    }

    films.forEach((film) => {
      if (items.length < limit) {
        items.push(film);
      }
    });

    page += 1;
  }

  return items;
}

async function fetchHtml(path) {
  try {
    const { data } = await http.get(path);
    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return null;
    }
    throw error;
  }
}

function parseFilms(html) {
  const $ = cheerio.load(html);
  let films = parseLegacyGrid($);
  if (!films.length) {
    films = parseReactGrid($);
  }
  return dedupeBySlug(films);
}

function parseLegacyGrid($) {
  const nodes = $('li.poster-container');
  const films = [];

  nodes.each((_, node) => {
    const el = $(node);
    const rawTitle = el.attr('data-film-name') || el.find('img').attr('alt');
    if (!rawTitle) {
      return;
    }

    const slug = normalizeSlug(el.attr('data-film-slug'));
    const year = parseInt(el.attr('data-film-release-year'), 10) || null;
    const rating = extractRatingFromClasses(el.attr('class'));

    films.push({
      title: rawTitle.trim(),
      slug,
      year,
      rating,
      letterboxdUrl: slug ? `${BASE_URL}${slug}` : null,
    });
  });

  return films;
}

function parseReactGrid($) {
  const nodes = $('div.react-component[data-component-class="LazyPoster"]');
  const films = [];

  nodes.each((_, node) => {
    const el = $(node);
    const gridItem = el.closest('li.griditem');
    if (!gridItem.length || !el.closest('.poster-grid').length) {
      return;
    }

    const rawTitle = el.attr('data-item-name');
    if (!rawTitle) return;

    const slugPath =
      el.attr('data-item-link') || el.attr('data-target-link') || el.attr('data-item-slug');
    const slug = normalizeSlug(slugPath);
    const year = extractYear(el.attr('data-item-full-display-name') || rawTitle);
    const rating = extractRatingFromClasses(gridItem.find('span.rating').attr('class'));

    films.push({
      title: sanitizeTitle(rawTitle),
      slug,
      year,
      rating,
      letterboxdUrl: slug ? `${BASE_URL}${slug}` : null,
    });
  });

  return films;
}

function extractRatingFromClasses(className = '') {
  if (!className) return null;
  const directMatch = className.match(/rated-(\d+)/);
  if (!directMatch) return null;
  const rating = parseInt(directMatch[1], 10);
  if (Number.isNaN(rating)) return null;
  return rating / 2;
}

function extractYear(text = '') {
  const match = text.match(/\((\d{4})\)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

function sanitizeTitle(title = '') {
  return title.replace(/\(\d{4}\)$/, '').trim();
}

function normalizeSlug(slugPath) {
  if (!slugPath) return null;
  if (slugPath.startsWith('http')) {
    try {
      const url = new URL(slugPath);
      return url.pathname;
    } catch {
      return null;
    }
  }
  if (slugPath.startsWith('/')) {
    return slugPath;
  }
  return `/film/${slugPath.replace(/^\/+/, '')}/`;
}

function dedupeBySlug(films) {
  const seen = new Set();
  return films.filter((film) => {
    const key = film.slug || `${film.title}-${film.year || 'unknown'}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function fetchFavorites(username) {
  const safeUser = encodeURIComponent(username.trim());
  const html = await fetchHtml(`/${safeUser}/`);
  if (!html) {
    return [];
  }
  return parseFavorites(html);
}

function parseFavorites(html) {
  const $ = cheerio.load(html);
  const section = $('#favourites');
  if (!section.length) {
    return [];
  }

  const nodes = section.find('div.react-component[data-component-class="LazyPoster"]');
  const favorites = [];

  nodes.each((_, node) => {
    const el = $(node);
    const rawTitle = el.attr('data-item-name');
    if (!rawTitle) return;

    const slugPath =
      el.attr('data-item-link') || el.attr('data-target-link') || el.attr('data-item-slug');
    const slug = normalizeSlug(slugPath);
    const year = extractYear(el.attr('data-item-full-display-name') || rawTitle);

    favorites.push({
      title: sanitizeTitle(rawTitle),
      slug,
      year,
      rating: null,
      letterboxdUrl: slug ? `${BASE_URL}${slug}` : null,
    });
  });

  return favorites.slice(0, 4);
}

async function scrapeUserProfile(username, options = {}) {
  if (!username) {
    throw new Error('USERNAME_REQUIRED');
  }

  const maxFilms = options.maxFilms || DEFAULT_MAX_FILMS;
  const maxWatchlist = options.maxWatchlist || DEFAULT_MAX_WATCHLIST;

  const films = await fetchCollection(username, 'films', maxFilms);
  let watchlist = [];
  try {
    watchlist = await fetchCollection(username, 'watchlist', maxWatchlist);
  } catch (error) {
    console.warn(`Watchlist scrape failed for ${username}: ${error.message}`);
    watchlist = [];
  }

  let favorites = [];
  try {
    favorites = await fetchFavorites(username);
  } catch (error) {
    console.warn(`Favorites scrape failed for ${username}: ${error.message}`);
    favorites = [];
  }

  return { username: username.trim(), films, watchlist, favorites };
}

module.exports = {
  scrapeUserProfile,
};
