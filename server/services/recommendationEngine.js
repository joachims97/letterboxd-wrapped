const { fetchRecommendations } = require('./tmdbClient');
const { scoreFilmWithProfile } = require('./reportBuilder');

const MAX_HIGH_RATED_SEEDS = 12;
const TMDB_RESULTS_PER_SEED = 20;
const TMDB_WEIGHT = 0.65;
const TASTE_WEIGHT = 0.35;

async function generateWatchlistRecommendations({
  favorites = [],
  films = [],
  watchlist = [],
  controversial = { underrated: [] },
  tasteProfile,
}) {
  if (!watchlist.length) {
    return [];
  }

  const seeds = buildSeedSet({ favorites, films, controversial });
  if (!seeds.length) {
    return fallbackTasteRecommendations(watchlist, tasteProfile);
  }

  const tmdbScores = await aggregateTmdbRecommendations(seeds);
  if (!tmdbScores.size) {
    return fallbackTasteRecommendations(watchlist, tasteProfile);
  }

  const ranked = rankWatchlist(watchlist, tasteProfile, tmdbScores);
  if (!ranked.length) {
    return fallbackTasteRecommendations(watchlist, tasteProfile);
  }

  return ranked;
}

function buildSeedSet({ favorites = [], films = [], controversial = { underrated: [] } }) {
  const seeds = new Map();

  favorites.forEach((film) => {
    addSeed(seeds, film, 3.0);
  });

  const highRated = films
    .filter((film) => typeof film.rating === 'number' && film.rating >= 4)
    .sort((a, b) => {
      if (b.rating === a.rating) {
        return (b.tmdb?.voteAverage || 0) - (a.tmdb?.voteAverage || 0);
      }
      return b.rating - a.rating;
    })
    .slice(0, MAX_HIGH_RATED_SEEDS);

  highRated.forEach((film) => {
    const ratingBoost = (film.rating - 4) * 0.5;
    addSeed(seeds, film, 2.0 + ratingBoost);
  });

  (controversial?.underrated || [])
    .slice(0, 6)
    .forEach((film) => addSeed(seeds, film, 2.5));

  return Array.from(seeds.values());
}

function addSeed(seedMap, film, weight) {
  const tmdbId = film?.tmdb?.tmdbId;
  if (!tmdbId) return;
  const existing = seedMap.get(tmdbId);
  if (!existing || existing.weight < weight) {
    seedMap.set(tmdbId, {
      tmdbId,
      weight,
    });
  }
}

async function aggregateTmdbRecommendations(seeds) {
  const scores = new Map();

  for (const seed of seeds) {
    try {
      const recs = await fetchRecommendations(seed.tmdbId);
      recs.slice(0, TMDB_RESULTS_PER_SEED).forEach((movie, index) => {
        const rankWeight = (TMDB_RESULTS_PER_SEED - index) / TMDB_RESULTS_PER_SEED;
        const incremental = seed.weight * rankWeight;
        const nextScore = (scores.get(movie.id) || 0) + incremental;
        scores.set(movie.id, nextScore);
      });
    } catch (error) {
      console.warn(`TMDB recommendations failed for ${seed.tmdbId}: ${error.message}`);
    }
  }

  return normalizeScoreMap(scores);
}

function normalizeScoreMap(scoreMap) {
  let max = 0;
  scoreMap.forEach((value) => {
    if (value > max) max = value;
  });
  if (!max) return new Map();

  const normalized = new Map();
  scoreMap.forEach((value, key) => {
    normalized.set(key, Number((value / max).toFixed(3)));
  });
  return normalized;
}

function rankWatchlist(watchlist, tasteProfile, tmdbScores) {
  const tasteScores = new Map();
  let tasteMax = 0;

  watchlist.forEach((film) => {
    if (!film.tmdb?.tmdbId) return;
    const score = scoreFilmWithProfile(film, tasteProfile);
    tasteScores.set(film.tmdb.tmdbId, score);
    if (score > tasteMax) tasteMax = score;
  });

  if (!tasteMax) tasteMax = 1;

  const recommendations = [];
  watchlist.forEach((film) => {
    const tmdbId = film.tmdb?.tmdbId;
    if (!tmdbId) return;
    const tmdbScore = tmdbScores.get(tmdbId);
    if (!tmdbScore) return;

    const tasteScore = (tasteScores.get(tmdbId) || 0) / tasteMax;
    const combined = Number((tmdbScore * TMDB_WEIGHT + tasteScore * TASTE_WEIGHT).toFixed(3));
    recommendations.push({
      ...film,
      score: combined,
      meta: {
        tmdbScore,
        tasteScore,
      },
    });
  });

  recommendations.sort((a, b) => b.score - a.score);
  return recommendations.slice(0, 10);
}

function fallbackTasteRecommendations(watchlist, tasteProfile) {
  const scored = watchlist
    .filter((film) => film.tmdb?.tmdbId)
    .map((film) => ({
      ...film,
      score: scoreFilmWithProfile(film, tasteProfile),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const max = scored[0]?.score || 1;
  return scored.map((film) => ({
    ...film,
    score: Number(((film.score / max) || 0).toFixed(3)),
  }));
}

module.exports = {
  generateWatchlistRecommendations,
};
