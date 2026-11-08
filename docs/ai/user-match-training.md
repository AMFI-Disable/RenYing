# User Match Training Data

## What Is Collected

The game defaults to contributing match samples to improve the AI. Players can turn this off at any time in **Settings → AI Model Training**. New installations and existing settings without a saved choice default to on.

For completed player fights, the game uploads up to 480 samples at six-frame intervals. Each bout in a multi-fight run is contributed separately. A sample contains a hero identifier, 19 normalized combat-state values, a bit mask for movement, attack, dodge, ultimate, and skills, a shaped reward, and a terminal marker. The upload includes the game mode and a win, loss, or draw result. It does not include replay inputs, player names, account IDs, skins, or exact play time. Samples are kept for 180 days and are rate-limited at the Worker.

The upload queue is local and capped at 30 matches while offline. Turning contribution off clears that pending queue and prevents further uploads. The offline edition does not upload. Training-room sessions, demos, AI spectator matches, and replay playback are excluded; completed player matches across the other supported modes contribute when samples are available.

## Export For Offline Training

The Worker migration creates `ai_training_matches` automatically on its next request after deployment. An administrator can export the sanitized rows in pages through `GET /api/admin/ai-training/export`. The CLI streams them as JSON Lines without writing a dataset into the repository:

```sh
RENYING_ADMIN_ENDPOINT=https://your-worker.example \
RENYING_ADMIN_TOKEN=your-admin-token \
node tools/ai/export-user-matches.mjs > /tmp/renying-user-matches.jsonl
```

Keep the token private and keep exported player data outside the repository. Review and curate the dataset before using it in an offline training run. Uploading match data does not change the live AI model; model updates remain an explicit offline training and review step.
