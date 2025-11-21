## Letterboxd Wrapped

Generate a personalized “Wrapped” style report for any public Letterboxd profile. The app scrapes a user’s logged films and watchlist, enriches each title with TMDB metadata, and builds visuals plus a recommendation engine inspired by their taste.

### Features

- Username lookup with a stylish Letterboxd-inspired UI
- Express API that scrapes watched films + watchlist (handles pagination) via Cheerio
- TMDB enrichment with cached responses (genres, runtime, countries, crew, ratings)
- Report sections: decade histogram, release year timeline, genre pie, runtime buckets, country diversity
- “Controversial takes” (user rating vs TMDB average), director deep dives, and a watchlist recommender that blends TMDB recommendations with the learned taste profile
- Share button (Web Share API / clipboard) and download-to-image button powered by html2canvas

### Getting Started

1. Install dependencies

   ```bash
   npm install
   ```

2. Create a `.env` file (copy `.env.example`) and add a TMDB API key.

   ```
   TMDB_API_KEY=your_tmdb_api_key
   PORT=3000
   ```

3. Start the development server

   ```bash
   npm run dev
   ```

4. Visit `http://localhost:3000`, enter a Letterboxd username, and generate their report.

### Notes

- The scraper respects pagination limits; adjust `maxFilms` / `maxWatchlist` via query params if needed.
- Watchlist scraping falls back gracefully if the list is private.
- TMDB calls are cached in memory to reduce rate limiting.
- Downloaded reports are static images of the rendered dashboard for easy sharing.
