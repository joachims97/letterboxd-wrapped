function buildReport({ username, films = [], watchlist = [], favorites = [] }) {
  const enrichedFilms = films.map(attachDerivedFields);
  const enrichedWatchlist = watchlist.map(attachDerivedFields);
  const enrichedFavorites = favorites.map(attachDerivedFields);

  const decadeHistogram = buildDecadeHistogram(enrichedFilms);
  const genreBreakdown = buildGenreBreakdown(enrichedFilms);
  const countryDiversity = buildCountryDiversity(enrichedFilms);
  const controversialTakes = buildControversialTakes(enrichedFilms);
  const directors = buildDirectorStats(enrichedFilms);
  const tasteProfile = buildTasteProfile(enrichedFilms);

  return {
    username,
    generatedAt: new Date().toISOString(),
    totals: {
      filmsWatched: enrichedFilms.length,
      watchlistSize: enrichedWatchlist.length,
      averageRating: calculateAverage(
        enrichedFilms.map((film) => film.rating).filter((rating) => typeof rating === 'number'),
      ),
    },
    favorites: enrichedFavorites.slice(0, 4),
    decadeHistogram,
    genreBreakdown,
    countryDiversity,
    controversialTakes,
    directors,
    tasteProfile,
    recommendations: [],
  };
}

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';

function attachDerivedFields(film) {
  const releaseYear = film.tmdb?.releaseYear || film.year || null;
  const runtime = film.tmdb?.runtime || null;
  const genres = film.tmdb?.genres?.map((genre) => genre.name) || [];
  const primaryCountry = film.tmdb?.countries?.[0];
  const countries = primaryCountry
    ? [primaryCountry.iso_3166_1 || primaryCountry.name || 'Unknown']
    : [];
  const directors = film.tmdb?.directors || [];
  const cast =
    film.tmdb?.cast?.map((actor) => actor.name).filter(Boolean).slice(0, 6) || [];

  return {
    ...film,
    releaseYear,
    runtime,
    genres,
    countries,
    directors,
    cast,
    posterUrl: buildPosterUrl(film.tmdb?.posterPath),
    voteAverage: film.tmdb?.voteAverage || null,
  };
}

function buildPosterUrl(path) {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}${path}`;
}

function buildDecadeHistogram(films) {
  const startDecade = 1920;
  const endDecade = 2020;
  const counts = {};

  films.forEach((film) => {
    if (!film.releaseYear) return;
    const decade = getDecadeLabel(film.releaseYear);
    counts[decade] = (counts[decade] || 0) + 1;
  });

  const labels = [];
  const data = [];
  for (let decade = startDecade; decade <= endDecade; decade += 10) {
    const label = `${decade}s`;
    labels.push(label);
    data.push(counts[label] || 0);
  }

  return { labels, data };
}

function buildGenreBreakdown(films) {
  const counts = {};
  films.forEach((film) => {
    film.genres.forEach((genre) => {
      counts[genre] = (counts[genre] || 0) + 1;
    });
  });

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.map(([genre, count]) => ({ genre, count }));
}

function buildCountryDiversity(films) {
  const counts = {};
  films.forEach((film) => {
    film.countries.forEach((country) => {
      counts[country] = (counts[country] || 0) + 1;
    });
  });

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const topCountries = entries.slice(0, 10).map(([country, count]) => ({ country, count }));

  return {
    uniqueCountries: entries.length,
    topCountries,
  };
}

function buildControversialTakes(films) {
  const allDivergences = films
    .filter((film) => typeof film.rating === 'number' && typeof film.voteAverage === 'number')
    .map((film) => {
      const tmdbRatingFive = film.voteAverage / 2;
      const diff = Number((film.rating - tmdbRatingFive).toFixed(2));
      return { ...film, diff, tmdbRatingFive };
    });

  const underrated = allDivergences
    .filter((film) => film.diff >= 0.5)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 5);

  // First try films rated notably below consensus (diff <= -0.5)
  let overrated = allDivergences
    .filter((film) => film.diff <= -0.5)
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 5);

  // If none found, show the films the user rated lowest relative to consensus
  if (!overrated.length && allDivergences.length) {
    overrated = allDivergences
      .filter((film) => film.diff < 0)
      .sort((a, b) => a.diff - b.diff)
      .slice(0, 5);
  }

  return { underrated, overrated };
}

function buildDirectorStats(films) {
  const directorMap = {};

  films.forEach((film) => {
    film.directors.forEach((name) => {
      if (!name) return;
      if (!directorMap[name]) {
        directorMap[name] = { name, count: 0, ratings: [] };
      }
      directorMap[name].count += 1;
      if (typeof film.rating === 'number') {
        directorMap[name].ratings.push(film.rating);
      }
    });
  });

  const entries = Object.values(directorMap)
    .map((entry) => ({
      ...entry,
      averageRating: calculateAverage(entry.ratings),
    }))
    .sort((a, b) => {
      if (b.count === a.count) {
        return (b.averageRating || 0) - (a.averageRating || 0);
      }
      return b.count - a.count;
    })
    .slice(0, 10);

  return entries;
}

function buildTasteProfile(films) {
  const highRated =
    films.filter((film) => typeof film.rating === 'number' && film.rating >= 4) || films;
  const source = highRated.length ? highRated : films;

  const profile = {
    genres: tallyFeature(source, (film) => film.genres),
    decades: tallyFeature(
      source,
      (film) => (film.releaseYear ? [getDecadeLabel(film.releaseYear)] : []),
    ),
    directors: tallyFeature(source, (film) => film.directors),
    countries: tallyFeature(source, (film) => film.countries),
  };

  return normalizeProfile(profile);
}

function tallyFeature(films, extractor) {
  const counts = {};
  films.forEach((film) => {
    extractor(film).forEach((item) => {
      if (!item) return;
      counts[item] = (counts[item] || 0) + 1;
    });
  });
  return counts;
}

function normalizeProfile(profile) {
  const normalized = {};
  Object.entries(profile).forEach(([key, counts]) => {
    const total = Object.values(counts).reduce((acc, value) => acc + value, 0) || 1;
    const map = {};
    Object.entries(counts).forEach(([item, value]) => {
      map[item] = Number((value / total).toFixed(3));
    });
    normalized[key] = map;
  });
  return normalized;
}

function scoreFilmWithProfile(film, profile) {
  let score = 0;
  film.genres.forEach((genre) => {
    score += (profile.genres[genre] || 0) * 3;
  });

  const decade = film.releaseYear ? getDecadeLabel(film.releaseYear) : null;
  if (decade) {
    score += (profile.decades[decade] || 0) * 2;
  }

  film.directors.forEach((director) => {
    score += (profile.directors[director] || 0) * 3.5;
  });

  film.countries.forEach((country) => {
    score += (profile.countries[country] || 0) * 1.5;
  });

  if (film.voteAverage) {
    score += (film.voteAverage / 10) * 1.25;
  }

  return score;
}

function getDecadeLabel(year) {
  const decade = Math.floor(year / 10) * 10;
  return `${decade}s`;
}

function calculateAverage(values) {
  if (!values.length) return null;
  return Number((sum(values) / values.length).toFixed(2));
}

function sum(values) {
  return values.reduce((acc, value) => acc + value, 0);
}

module.exports = {
  buildReport,
  scoreFilmWithProfile,
  attachDerivedFields,
};
