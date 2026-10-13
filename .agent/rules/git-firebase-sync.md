---
description: Automatically synchronize all feature updates and version rollbacks to both GitHub (origin/main) and the published Firebase Hosting app (nutripulse-tracker-antu.web.app).
---

# GitHub & Live Firebase App Synchronization Rule

Whenever the user asks to add, modify, or fix any feature in this project, or asks to revert/roll back to a previous committed version:

1. **For Feature Updates / Bug Fixes**:
   - After implementing and verifying the changes, always run:
     ```bash
     npm run ship -- "<descriptive commit message>"
     ```
   - This command runs the automated test suite (`npm test`), builds the production PWA bundle (`npm run build`), commits and pushes the changes to GitHub (`https://github.com/Sadiq-Antu/calorie-tracker-app` on `origin/main`), and deploys the live application to Firebase Hosting (`https://nutripulse-tracker-antu.web.app`).

2. **For Rolling Back to Any Previous Committed Version**:
   - Inspect commit history using `npm run history:commits` (or `git log --oneline`) to identify the target `<commit-sha>`.
   - Execute:
     ```bash
     npm run rollback -- <commit-sha>
     ```
   - This restores the exact file tree of `<commit-sha>`, commits and pushes the restoration to GitHub (`origin/main`), rebuilds the production bundle, and deploys that restored version to the live published Firebase Hosting app (`https://nutripulse-tracker-antu.web.app`).
