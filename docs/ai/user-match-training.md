# User Match Training Data

## What Is Collected

The game defaults to contributing match samples to improve the AI. Players can turn this off at any time in **Settings → AI Model Training**. New installations and existing settings without a saved choice default to on.

For completed player fights, the game uploads up to 480 samples per locally controlled fighter at six-frame intervals. Local multiplayer and team matches contribute a separate episode for each human-controlled fighter; in online matches, each participant's device contributes its own fighter or fighters, avoiding uploading the remote player's controls from both clients. Each bout in a multi-fight run is contributed separately. A sample contains a hero identifier, 19 normalized combat-state values from that fighter's perspective, a bit mask for movement, attack, dodge, ultimate, and skills, a shaped reward, and a terminal marker. The upload includes the game mode and a win, loss, or draw result. It does not include replay inputs, player names, account IDs, skins, or exact play time. Samples are kept for 180 days and are rate-limited at the Worker.

The upload queue is local and capped at 30 matches while offline. Turning contribution off clears that pending queue and prevents further uploads. The offline edition does not upload. Training-room sessions, demos, AI spectator matches, and replay playback are excluded; completed player matches across the other supported modes contribute when samples are available.

## Export And Audit For Offline Training

The Worker migration creates `ai_training_matches` automatically on its next request after deployment. An administrator can export the sanitized rows in pages through `GET /api/admin/ai-training/export`. The CLI streams them as JSON Lines without writing a dataset into the repository:

```sh
RENYING_ADMIN_ENDPOINT=https://your-worker.example \
RENYING_ADMIN_TOKEN=your-admin-token \
node tools/ai/export-user-matches.mjs > /tmp/renying-user-matches.jsonl
```

The export requires the admin token and includes no account identifier. The deployed Worker health and ingestion routes can be checked without creating fake records; an empty POST is expected to fail validation, while unauthenticated export must be rejected. The live deployment was checked after the upload feature was released. The current shell does not have the admin token, so real exports and dataset coverage could not be inspected here.

Keep the token private and keep exported data outside the repository. Audit it locally before training:

```sh
node tools/ai/train-user-matches.mjs --input /tmp/renying-user-matches.jsonl
```

The report contains aggregate counts by hero, mode, result, and data quality. Each player fighter is exported as its own episode, so you can compare contribution and model coverage across heroes. It never prints sample rows. Episodes are reconstructed from terminal markers and split by whole bout, so adjacent samples from the same bout cannot leak into both training and holdout sets. Malformed and incomplete bouts are excluded from the model evaluation and reported.

To produce an offline candidate, supply an output path outside the repository:

```sh
node tools/ai/train-user-matches.mjs \
  --input /tmp/renying-user-matches.jsonl \
  --train \
  --output /tmp/renying-ai-action-candidate.json
```

The action model is trained separately for each hero and is compared against a per-action majority baseline on held-out bouts. A hero only gets a candidate when it has at least 20 training bouts, 5 held-out bouts, and 500 training samples, with at least 2% lower held-out log loss and no bit-accuracy regression. If no hero passes, the tool exits without writing a candidate. This is a behavior-prediction gate, not proof of stronger in-game play: candidate weights are not loaded by the game or installed as `src/models/ai-brain.json`. Before any live promotion, candidates still need AI arena matchups against the current brain and replay/rollback checks. Training output and exported matches remain local and out of Git.

Uploads never change the live AI model. Model updates remain explicit, offline, and reviewable.
