# Additive Manufacturing Lab CRON Jobs

- [x] Delete unused models (request deleted, or model purged) from the datastore (every day).
- [x] Perform model-analysis using a queue system.

## Getting Started

A few environment variables are required. DOTENV is included.
```
# .env

# A PostgresSQL connection string. 
DB_CONNECTION=
MODEL_UPLOAD_DIR=
# URL of the orca-slicer-api container
SLICER_API_URL=http://localhost:3000
# Amount of days a model persists until it should be purged.
MODEL_LIFESPAN=267

# Optional. The baseline slicer profile used as a generic comparison reference for all models.
# These must match profiles available in the orca-slicer-api instance. Defaults shown below.
SLICER_PRINTER=Bambu Lab X1 Carbon 0.4 nozzle
SLICER_FILAMENT=Bambu PLA Basic @BBL X1C
SLICER_PRESET=0.20mm Standard @BBL X1C
```

```
npm install
npm run run
```

