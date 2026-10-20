# Screenshots

Real output of the running application (Chromium; 390-wide images are a phone viewport, 1280-wide are desktop
at 1440 scaled down), regenerated with `pnpm docs:screenshots`. Customer outcomes are produced by creating real
units in a development database and scanning them, so each result comes from the actual verification function.
The *unavailable* state simulates the `503` the server sends when the database cannot be reached.

Staff pages show synthetic development data. Nothing here is a mock-up.

| Customer (phone) | |
|---|---|
| `verify-recognized-390` | Code recognized, first check |
| `verify-revoked-390` | Code no longer valid |
| `verify-on-hold-390` | Part on hold |
| `verify-recalled-390` | Recall, with staff-approved wording |
| `verify-not-found-390` | Code can't be matched |
| `verify-unavailable-390` | Verification temporarily unavailable (not a verdict) |

Also: `home-1440`, `verify-idle-1440`, `faq-1440`, and the staff workspace (`admin-*-1440`, `admin-*-390`).
