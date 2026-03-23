const axios = require('axios');
const cache = require('../utils/cache');

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const REQUEST_TIMEOUT = 12000;
const DEFAULT_CONCURRENCY = 3;

function createClient() {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('Missing TMDB_API_KEY environment variable');
  }

  return axios.create({
    baseURL: TMDB_BASE_URL,
    timeout: REQUEST_TIMEOUT,
    params: {
      api_key: apiKey,
    },
  });
}

let client;

function getClient() {
  if (!client) {
    client = createClient();
  }
  return client;
}

async function searchMovie(title, year) {
  const http = getClient();
  const params = {
    query: title,
    include_adult: false,
    language: 'en-US',
  };

  if (year) {
    params.year = year;
  }

  const { data } = await http.get('/search/movie', { params });
  return data.results?.[0];
}

async function fetchMovieDetails(tmdbId) {
  const http = getClient();
  const { data } = await http.get(`/movie/${tmdbId}`, {
    params: { append_to_response: 'credits,release_dates' },
  });
  return data;
}

async function fetchRecommendations(tmdbId, { page = 1 } = {}) {
  const http = getClient();
  const { data } = await http.get(`/movie/${tmdbId}/recommendations`, {
    params: { page },
  });
  return data.results || [];
}

async function fetchMetadataForFilm(film) {
  const cacheKey = `tmdb:${film.tmdbId || film.slug || film.title}:${film.year || 'na'}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return { ...film, tmdb: cached };
  }

  let tmdbId = film.tmdbId;
  let searchResult = null;

  if (!tmdbId) {
    searchResult = await searchMovie(film.title, film.year);
    if (!searchResult) {
      return film;
    }
    tmdbId = searchResult.id;
  }

  const details = await fetchMovieDetails(tmdbId);
  const normalized = normalizeDetails(details, searchResult || details);

  cache.set(cacheKey, normalized);

  return {
    ...film,
    tmdb: normalized,
  };
}

function normalizeDetails(details, searchResult) {
  const releaseYear = (details.release_date || searchResult.release_date || '').slice(0, 4);
  const directors =
    details.credits?.crew
      ?.filter((crewMember) => crewMember.job === 'Director')
      .map((person) => person.name) || [];

  const cast =
    details.credits?.cast?.slice(0, 8).map((actor) => ({
      id: actor.id,
      name: actor.name,
      character: actor.character,
    })) || [];

  return {
    tmdbId: details.id,
    title: details.title,
    releaseYear: releaseYear ? parseInt(releaseYear, 10) : null,
    runtime: details.runtime || null,
    genres: details.genres || [],
    countries: details.production_countries || [],
    voteAverage: details.vote_average || searchResult.vote_average || null,
    posterPath: details.poster_path || searchResult.poster_path || null,
    backdropPath: details.backdrop_path || null,
    overview: details.overview || searchResult.overview || '',
    directors,
    cast,
  };
}

async function enrichFilms(films = []) {
  const concurrency =
    Number(process.env.TMDB_CONCURRENCY || DEFAULT_CONCURRENCY) || DEFAULT_CONCURRENCY;

  const limited = Math.min(
    films.length,
    Number(process.env.TMDB_MAX_ENRICH || films.length) || films.length,
  );

  const results = new Array(films.length);
  let cursor = 0;

  async function worker() {
    while (cursor < limited) {
      const index = cursor;
      cursor += 1;

      const film = films[index];
      try {
        results[index] = await fetchMetadataForFilm(film);
      } catch (error) {
        console.warn(
          `TMDB metadata failed for ${film.title} (${film.year || 'n/a'}): ${error.message}`,
        );
        results[index] = film;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, limited) }, () => worker());
  await Promise.all(workers);

  // Copy over untouched trailing items (if TMDB_MAX_ENRICH limited)
  for (let i = limited; i < films.length; i += 1) {
    results[i] = films[i];
  }

  return results;
}

module.exports = {
  enrichFilms,
  fetchRecommendations,
};
