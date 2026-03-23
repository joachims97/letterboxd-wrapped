require('dotenv').config();

const path = require('path');
const express = require('express');

const { scrapeUserProfile } = require('./services/letterboxdScraper');
const { enrichFilms } = require('./services/tmdbClient');
const { buildReport, attachDerivedFields } = require('./services/reportBuilder');
const { generateWatchlistRecommendations } = require('./services/recommendationEngine');

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', generatedAt: new Date().toISOString() });
});

app.get('/api/report/:username', async (req, res) => {
  const username = (req.params.username || '').trim();

  if (!username) {
    return res.status(400).json({ message: 'Username is required' });
  }

  try {
    const { films, watchlist, favorites } = await scrapeUserProfile(username);

    if (!films.length) {
      return res
        .status(404)
        .json({ message: 'No public films found for this user', username });
    }

    const [enrichedFilms, enrichedWatchlist, enrichedFavorites] = await Promise.all([
      enrichFilms(films),
      enrichFilms(watchlist),
      enrichFilms(favorites),
    ]);

    const derivedFilms = enrichedFilms.map(attachDerivedFields);
    const derivedWatchlist = enrichedWatchlist.map(attachDerivedFields);
    const derivedFavorites = enrichedFavorites.map(attachDerivedFields);

    const report = buildReport({
      username,
      films: derivedFilms,
      watchlist: derivedWatchlist,
      favorites: derivedFavorites,
    });

    try {
      report.recommendations = await generateWatchlistRecommendations({
        favorites: derivedFavorites,
        films: derivedFilms,
        watchlist: derivedWatchlist,
        controversial: report.controversialTakes,
        tasteProfile: report.tasteProfile,
      });
    } catch (recoError) {
      console.warn('TMDB-based recommendation failed', recoError.message);
      report.recommendations = [];
    }

    // Include slim film list for chart drill-down
    report._allFilms = derivedFilms.map((f) => ({
      title: f.title,
      releaseYear: f.releaseYear,
      rating: f.rating,
      genres: f.genres,
      countries: f.countries,
      directors: f.directors,
      posterUrl: f.posterUrl,
    }));

    return res.json(report);
  } catch (error) {
    console.error('Report generation failed', error.message);
    if (error.message === 'USER_OR_SECTION_NOT_FOUND') {
      return res.status(404).json({ message: 'Letterboxd user not found', username });
    }
    if (error.message === 'USERNAME_REQUIRED') {
      return res.status(400).json({ message: 'Username is required' });
    }
    if (error.message && error.message.includes('TMDB_API_KEY')) {
      return res.status(500).json({ message: error.message });
    }
    return res.status(500).json({
      message: 'Failed to build report',
      details: error.message,
    });
  }
});

const port = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Letterboxd Wrapped server running on http://localhost:${port}`);
  });
}

module.exports = app;
