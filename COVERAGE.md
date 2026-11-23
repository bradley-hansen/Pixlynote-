# Pixlynote interaction coverage

Generated from `index.html` and `tests/suites/` on branch `grokbot/interaction-coverage`, based on `f741001` (`grokbot/phone-persist-fix`).

This matrix lists every interactive control the inventory parser finds — buttons, links, forms, inputs, menus, modals, toggles, settings, admin tools, plus gestures and keyboard shortcuts — and the test that covers it.

## Status key

- **behavioral** — a named suite test asserts the product result (and, for write paths, that existing user data is not blanked).
- **auto** — covered by the generated `Interaction: …` test, which reveals the surface and clicks, types, or confirms the control is present. No deeper product assertion is attached yet.
- **gap** — inventoried with no test. There should be none; the coverage test fails if any appear.

## Totals

| | Before (f741001) | After |
| --- | ---: | ---: |
| Inventory items | 773 | 779 |
| Named tests after account expansion | 1059 | 1093 |
| Full `npm test` count (includes Coverage + Firestore safety) | 1061 | 1095 |
| Items with a behavioral suite test | 467 | 676 |
| Items with auto Interaction test only | 306 | 103 |
| Gaps (no test at all) | 0 | 0 |

The 6 added inventory items are gestures and keyboard shortcuts: pull-to-refresh, Escape to close menus, Enter in header search, Enter to send a story reply, and Enter on signup email and phone verification codes.

New suites on this branch:

- `tests/suites/37-write-guards.js` — profile, posts, comments, likes, connections, stories, DMs, subscriptions, account switch, settings, and logout must not blank stored phone, email, or membership fields. Runs across Personal, Business, Government, Organization, Plus, Business Plus, non-Plus, empty, official, and signed-out.
- `tests/suites/38-uncovered-surfaces.js` — behavioral tests for Account Center, create/edit close paths, policy tabs, Explore/Discover, stories, visitor profiles, Pixlynote AI, DMs, owner menu, post menus, drafts, and Likes/Saved panels.
- `tests/suites/39-gestures-shortcuts.js` — pull-to-refresh, Escape, header-search Enter, and story-reply Enter.
- `tests/helpers/protected-data.js` — shared snapshot/stamp/assert helper used by the new suites.

## Remaining auto-only keys

103 inventory keys still have only the automatic Interaction test. 103 of those are `listener:#id:event` keys whose matching `el:#id` already has a behavioral test (same control, second inventory key). The remaining unique leftover count is 0.

Every unique control now has a behavioral test. Remaining auto-only rows are duplicate listener keys for those same controls.

## Bugs found

No new product bug was confirmed on this branch. `f741001` already contains the phone-persist fix, and the write-guard suite did not reproduce a blank phone, email, or membership overwrite after Cancel, Save, likes, comments, follows, create post/note, stories, DMs, settings, account switch, or logout.

Observed special cases (not treated as regressions):

- The official `@pixlynote` account restores its display name and emblem on render and save. Tests allow that and still require the name and avatar to stay non-blank.
- Logout from Account Info (`#btn-ac-info-logout`) signs out immediately, with no confirm step. Stored phone and email remain in `localStorage`.
- Owner stories live in `state.userStories` (with a `timestamp`). The older `openStory()` name is not a function; `openStoryViewer(0)` is the opener. The harness already seeds `state.stories`, and the new tests also seed `state.userStories`.
- Header search and some list search fields are not visible at the default test viewport; tests exercise them through the DOM and keyboard events rather than a visible Playwright `fill`.

## How to read a row

For a **behavioral** row, the Test column is the named suite test. For an **auto** row, it is the generated Interaction test. Account lists show which fixtures the behavioral test runs against.

## Matrix

| Interaction | Kind | Test | Status |
| --- | --- | --- | --- |
| `el:#ac-associate-username-input` | input | Only a business can send an association invite, and it cannot invite itself (`15-business-associates.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#ac-blocked-search` | input | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#ac-cf-add-form` | form | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#ac-cf-search` | input | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#ac-history-field` | input | Account Center info tabs, contact visibility, history, 2FA, and Drafts all open the right panel (`38-uncovered-surfaces.js`, personal, business) | behavioral |
| `el:#ac-muted-search` | input | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#ac-priv-username-input` | input | E2E Admin Tools: @pixlynote metrics, pending deactivations, verification panels, and Privileged Access invite/revoke (`26-e2e-all-account-types-admin.js`, pixlynote) | behavioral |
| `el:#ac-pw-confirm` | input | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#ac-pw-current` | input | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#ac-pw-new` | input | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#ac-toggle-show-email` | control | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) +1 more | behavioral |
| `el:#ac-toggle-show-phone` | control | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) +1 more | behavioral |
| `el:#bizver-country` | input | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#bizver-dba-name` | input | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#bizver-domain-email` | input | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#bizver-email-code` | input | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#bizver-entity-type` | input | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#bizver-file-address-proof` | input | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#bizver-file-articles` | input | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#bizver-file-photo-id` | input | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#bizver-file-tax-letter` | input | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#bizver-legal-name` | input | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#bizver-registration-number` | input | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#bizver-rep-name` | input | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#bizver-rep-title` | input | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#bizver-tax-id` | input | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#bizver-trademark` | input | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-ac-back` | control | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#btn-ac-cancel-logout-others` | control | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#btn-ac-cf-add` | control | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#btn-ac-confirm-logout-others` | control | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#btn-ac-deactivate-account` | control | Deactivate: personal account schedules a 30-day deletion, appears on the @pixlynote Pending Deactivations card, cancel clears it, and an expired window calls the stubbed purge (`14-deactivate.js`, personal) | behavioral |
| `el:#btn-ac-grant-privileged` | control | E2E Admin Tools: @pixlynote metrics, pending deactivations, verification panels, and Privileged Access invite/revoke (`26-e2e-all-account-types-admin.js`, pixlynote) | behavioral |
| `el:#btn-ac-info-logout` | control | Logout from Account Info leaves the stored phone and email in place so the next login can restore them (`37-write-guards.js`, personal) | behavioral |
| `el:#btn-ac-info-tab-contact` | control | Account Center info tabs, contact visibility, history, 2FA, and Drafts all open the right panel (`38-uncovered-surfaces.js`, personal, business) | behavioral |
| `el:#btn-ac-info-tab-details` | control | Account Center info tabs, contact visibility, history, 2FA, and Drafts all open the right panel (`38-uncovered-surfaces.js`, personal, business) | behavioral |
| `el:#btn-ac-info-tab-history` | control | Account Center info tabs, contact visibility, history, 2FA, and Drafts all open the right panel (`38-uncovered-surfaces.js`, personal, business) | behavioral |
| `el:#btn-ac-invite-associate` | control | Only a business can send an association invite, and it cannot invite itself (`15-business-associates.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-ac-leave-associated-business` | control | Only a business can send an association invite, and it cannot invite itself (`15-business-associates.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#btn-ac-log-filter-all` | control | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#btn-ac-log-filter-login` | control | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#btn-ac-log-filter-password` | control | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#btn-ac-login` | control | Account Center Login and Sign up, Drafts list, and Likes/Saved panels respond to clicks without wiping profile data (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-ac-logout-other-sessions` | control | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#btn-ac-open-2fa` | control | Account Center info tabs, contact visibility, history, 2FA, and Drafts all open the right panel (`38-uncovered-surfaces.js`, personal, business) | behavioral |
| `el:#btn-ac-open-login-activity` | control | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#btn-ac-open-sessions` | control | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#btn-ac-open-your-account` | control | Deactivate: personal account schedules a 30-day deletion, appears on the @pixlynote Pending Deactivations card, cancel clears it, and an expired window calls the stubbed purge (`14-deactivate.js`, personal) +1 more | behavioral |
| `el:#btn-ac-sa-tab-apps-sessions` | control | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#btn-ac-sa-tab-security` | control | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#btn-ac-signup` | control | Account Center Login and Sign up, Drafts list, and Likes/Saved panels respond to clicks without wiping profile data (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-ac-tab-account-info` | control | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#btn-ac-tab-associate` | control | Only a business can send an association invite, and it cannot invite itself (`15-business-associates.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-ac-tab-blocked` | control | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#btn-ac-tab-change-password` | control | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#btn-ac-tab-close-friends` | control | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#btn-ac-tab-drafts` | control | Account Center info tabs, contact visibility, history, 2FA, and Drafts all open the right panel (`38-uncovered-surfaces.js`, personal, business) | behavioral |
| `el:#btn-ac-tab-muted` | control | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#btn-ac-tab-privacy-safety` | control | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) +1 more | behavioral |
| `el:#btn-ac-tab-privileged-access` | control | E2E Admin Tools: @pixlynote metrics, pending deactivations, verification panels, and Privileged Access invite/revoke (`26-e2e-all-account-types-admin.js`, pixlynote) | behavioral |
| `el:#btn-ac-tab-security-access` | control | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#btn-ac-tab-spam` | control | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#btn-ac-tab-verification` | control | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#btn-account-type-business` | control | E2E Auth: Splash -> Business sign-up (DBA + Industry Other + Step 2 bio/link) -> Main view (`21-e2e-auth-and-onboarding.js`, signed-out) +1 more | behavioral |
| `el:#btn-account-type-personal` | control | E2E Auth: Splash -> Business sign-up (DBA + Industry Other + Step 2 bio/link) -> Main view (`21-e2e-auth-and-onboarding.js`, signed-out) | behavioral |
| `el:#btn-account-type-switch-confirm` | control | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) +2 more | behavioral |
| `el:#btn-account-type-switch-keep` | control | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-auth-back-to-splash` | control | Login: a seeded account can sign in with the correct password (`02-login.js`, signed-out) +1 more | behavioral |
| `el:#btn-auth-return-session` | control | Item 8: Switcher preserves existing accounts when adding 2nd/3rd/4th via login or signup, re-adding existing, or canceling mid-add (`29-nov23-fixes.js`, personal) | behavioral |
| `el:#btn-auth-submit` | control | Login: empty credentials are rejected (`02-login.js`, signed-out) | behavioral |
| `el:#btn-back-from-user-profile` | control | Steering 5b: < Back to Explore on @digitalassetpro profile navigates back to Explore on desktop and mobile (`27-e2e-steering-bugs.js`, personal) | behavioral |
| `el:#btn-back-user-text` | control | Visitor profile buttons, contact links, tabs, and avatar open the expected surfaces (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-bizver-resend-email-code` | control | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-bizver-send-email-code` | control | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-bizver-verify-email-code` | control | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-cancel-deactivate` | control | Deactivate: personal account schedules a 30-day deletion, appears on the @pixlynote Pending Deactivations card, cancel clears it, and an expired window calls the stubbed purge (`14-deactivate.js`, personal) | behavioral |
| `el:#btn-cancel-delete` | control | E2E Post lifecycle: create post -> non-Plus edit paywall -> Plus edit post -> cancel & confirm delete post (`22-e2e-feed-explore-posts-notes.js`, personal, business) +1 more | behavioral |
| `el:#btn-cancel-delete-draft` | control | E2E Drafts: save post & note drafts, resume into composer, cancel & confirm delete draft (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#btn-cancel-edit-profile` | control | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) +1 more | behavioral |
| `el:#btn-cancel-switch-password` | control | Everything for the account switcher exists (`18-account-switcher.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#btn-caption-gemini` | control | Create Post and Edit Profile close buttons, caption helper, file inputs, and Close Friends toggles work without wiping the profile (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-caption-suggestions-shuffle` | control | E2E Post lifecycle: create post -> non-Plus edit paywall -> Plus edit post -> cancel & confirm delete post (`22-e2e-feed-explore-posts-notes.js`, personal, business) | behavioral |
| `el:#btn-cf-menu-connect` | control | Item 6: Stale outbound follower edges are cleaned up (6a) and Close Friends caret includes Connect action (6b) (`29-nov23-fixes.js`, personal) | behavioral |
| `el:#btn-cf-menu-toggle` | control | E2E Profile links, contact buttons, Connections modals, and outbound mailto/Stripe links (`25-e2e-account-center-settings-links.js`, business) | behavioral |
| `el:#btn-close-account-center` | control | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#btn-close-account-switcher` | control | Everything for the account switcher exists (`18-account-switcher.js`, personal, business, empty, pixlynote) +2 more | behavioral |
| `el:#btn-close-account-type-switch` | control | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-close-business-verification` | control | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-close-create-modal` | control | Create Post and Edit Profile close buttons, caption helper, file inputs, and Close Friends toggles work without wiping the profile (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-close-discover-creators-modal` | control | Discover Creators shows only unconnected users, including in search (`09-discover.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#btn-close-drafts` | control | E2E Drafts: save post & note drafts, resume into composer, cancel & confirm delete draft (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#btn-close-edit-profile` | control | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) +1 more | behavioral |
| `el:#btn-close-followers-modal` | control | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-close-following-modal` | control | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-close-forgot-password` | control | E2E Auth: Splash Login -> Password toggle -> Forgot Password E2E -> Login with new password -> Logout (`21-e2e-auth-and-onboarding.js`, signed-out) | behavioral |
| `el:#btn-close-help-center` | control | Item 7: Right-side (⋮) drawer has Help Center above Info/About with FAQs and Submit feedback + mailto fallback (`29-nov23-fixes.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-close-messages` | control | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-close-note-composer` | control | E2E Notes & Explore: create note, search Explore Posts & Notes, open Discover Creators (`22-e2e-feed-explore-posts-notes.js`, personal) | behavioral |
| `el:#btn-close-note-modal` | control | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-close-post-modal` | control | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-close-story` | control | E2E Stories: create story -> viewer heart, reply, comments/viewers sheets, share-to-feed, delete story (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#btn-close-story-comments` | control | E2E Stories: create story -> viewer heart, reply, comments/viewers sheets, share-to-feed, delete story (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#btn-close-story-owner-menu` | control | E2E Stories: create story -> viewer heart, reply, comments/viewers sheets, share-to-feed, delete story (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#btn-close-story-viewers` | control | E2E Stories: create story -> viewer heart, reply, comments/viewers sheets, share-to-feed, delete story (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#btn-close-switch-password` | control | Everything for the account switcher exists (`18-account-switcher.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#btn-close-verification-badges` | control | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-close-verification-paywall` | control | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-close-verification-request` | control | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-confirm-cancel-membership` | control | Cancel period end: E2E: confirm dialog, period-end cancel keeps Plus, modal shows Plus ends on date (`34-cancel-period-end.js`, personal) | behavioral |
| `el:#btn-confirm-deactivate` | control | Deactivate: personal account schedules a 30-day deletion, appears on the @pixlynote Pending Deactivations card, cancel clears it, and an expired window calls the stubbed purge (`14-deactivate.js`, personal) | behavioral |
| `el:#btn-confirm-delete` | control | E2E Post lifecycle: create post -> non-Plus edit paywall -> Plus edit post -> cancel & confirm delete post (`22-e2e-feed-explore-posts-notes.js`, personal, business) +1 more | behavioral |
| `el:#btn-confirm-delete-draft` | control | E2E Drafts: save post & note drafts, resume into composer, cancel & confirm delete draft (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#btn-confirm-switch-password` | control | Everything for the account switcher exists (`18-account-switcher.js`, personal, business, empty, pixlynote) +3 more | behavioral |
| `el:#btn-delete-highlight` | control | E2E Highlights: create highlight -> update highlight -> delete highlight (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#btn-disconnect-cancel` | control | Item 5: Tapping Connected shows Disconnect confirm dropdown (Cancel preserves, Disconnect removes) on profile & lists (`29-nov23-fixes.js`, personal) | behavioral |
| `el:#btn-disconnect-confirm` | control | Item 5: Tapping Connected shows Disconnect confirm dropdown (Cancel preserves, Disconnect removes) on profile & lists (`29-nov23-fixes.js`, personal) | behavioral |
| `el:#btn-dismiss-business-info-banner` | control | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-dismiss-cancel-membership` | control | Cancel period end: E2E: confirm dialog, period-end cancel keeps Plus, modal shows Plus ends on date (`34-cancel-period-end.js`, personal) | behavioral |
| `el:#btn-dm-back-threads` | control | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-dm-delete-thread` | control | E2E DMs: send message, quick reaction, thread search, DM share, cancel & confirm delete thread (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `el:#btn-dm-new-chat` | control | Steering 5c (mobile 390x844): DMs + New Chat, Chat button, and conversation row open thread and input (`27-e2e-steering-bugs.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-dm-photo` | control | E2E DMs: send message, quick reaction, thread search, DM share, cancel & confirm delete thread (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `el:#btn-dm-send` | control | E2E DMs: send message, quick reaction, thread search, DM share, cancel & confirm delete thread (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `el:#btn-dm-share-send` | control | DM share, quick reactions, new-chat picker, and delete-thread confirm/cancel work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-dm-view-profile` | control | E2E DMs: send message, quick reaction, thread search, DM share, cancel & confirm delete thread (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `el:#btn-drawer-help-center` | control | Item 7: Right-side (⋮) drawer has Help Center above Info/About with FAQs and Submit feedback + mailto fallback (`29-nov23-fixes.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-drawer-info-about` | control | Owner menu: username with nothing under it, four items in order, no version footer (`04-owner-menu.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-edit-account-business` | control | Edit Profile: switching category starts the other type's name empty and requires a name to save (`03-edit-profile.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-edit-account-government` | control | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#btn-edit-account-organization` | control | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#btn-edit-account-personal` | control | Edit Profile: switching category starts the other type's name empty and requires a name to save (`03-edit-profile.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-edit-complete-business-info` | control | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#btn-edit-profile-modal` | control | Edit Profile: Send code appears on a changed email row (`03-edit-profile.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-edit-request-verification` | control | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-edit-resend-email-code` | control | Edit Profile: Send code appears on a changed email row (`03-edit-profile.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-edit-resend-phone-code` | control | Edit Profile: Send code appears on a changed phone row (`03-edit-profile.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-edit-send-email-code` | control | Edit Profile: Send code appears on a changed email row (`03-edit-profile.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#btn-edit-send-phone-code` | control | Edit Profile: Send code appears on a changed phone row (`03-edit-profile.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-edit-verify-email-code` | control | Edit Profile: Send code appears on a changed email row (`03-edit-profile.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#btn-edit-verify-phone-code` | control | Edit Profile: Send code appears on a changed phone row (`03-edit-profile.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-explore-refresh` | control | Explore refresh, Discover shuffle, header search, nav brand, and load-more all work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-feedback-cancel` | control | Fix 6c: Help > Submit feedback validates, sends to support@pixlynote.com via the Worker, and falls back to mailto (`28-e2e-fixes.js`, personal, pixlynote) | behavioral |
| `el:#btn-feedback-close` | control | Fix 6c: Help > Submit feedback validates, sends to support@pixlynote.com via the Worker, and falls back to mailto (`28-e2e-fixes.js`, personal, pixlynote) | behavioral |
| `el:#btn-feedback-send` | control | Fix 6c: Help > Submit feedback validates, sends to support@pixlynote.com via the Worker, and falls back to mailto (`28-e2e-fixes.js`, personal, pixlynote) | behavioral |
| `el:#btn-forgot-back` | control | E2E Auth: Splash Login -> Password toggle -> Forgot Password E2E -> Login with new password -> Logout (`21-e2e-auth-and-onboarding.js`, signed-out) | behavioral |
| `el:#btn-forgot-confirm-reset` | control | E2E Auth: Splash Login -> Password toggle -> Forgot Password E2E -> Login with new password -> Logout (`21-e2e-auth-and-onboarding.js`, signed-out) | behavioral |
| `el:#btn-forgot-password` | control | Login: wrong password is rejected (`02-login.js`, signed-out) +1 more | behavioral |
| `el:#btn-forgot-send-code` | control | E2E Auth: Splash Login -> Password toggle -> Forgot Password E2E -> Login with new password -> Logout (`21-e2e-auth-and-onboarding.js`, signed-out) | behavioral |
| `el:#btn-gov-badge-navy` | control | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) +2 more | behavioral |
| `el:#btn-gov-badge-slate` | control | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) +2 more | behavioral |
| `el:#btn-header-pixai` | control | Pixlynote AI header button, close, offline mode, and API key save work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-header-profile` | control | Everything for the account switcher exists (`18-account-switcher.js`, personal, business, empty, pixlynote) +5 more | behavioral |
| `el:#btn-help-center-feedback` | control | Item 7: Right-side (⋮) drawer has Help Center above Info/About with FAQs and Submit feedback + mailto fallback (`29-nov23-fixes.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-highlight-text` | control | Visitor profile buttons, contact links, tabs, and avatar open the expected surfaces (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-load-business-verifications` | control | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#btn-mark-all-read` | control | E2E Notifications: open dropdown, verify unread, mark all read, close backdrop (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `el:#btn-menu-block` | control | Profiles look identical to every viewer except the action buttons (`07-profile-parity.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#btn-menu-info-about` | control | Profiles look identical to every viewer except the action buttons (`07-profile-parity.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#btn-menu-mute` | control | Profiles look identical to every viewer except the action buttons (`07-profile-parity.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#btn-modal-delete-post` | control | E2E Post lifecycle: create post -> non-Plus edit paywall -> Plus edit post -> cancel & confirm delete post (`22-e2e-feed-explore-posts-notes.js`, personal, business) | behavioral |
| `el:#btn-modal-dm-share` | control | DM share, quick reactions, new-chat picker, and delete-thread confirm/cancel work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-modal-edit-post` | control | E2E Post lifecycle: create post -> non-Plus edit paywall -> Plus edit post -> cancel & confirm delete post (`22-e2e-feed-explore-posts-notes.js`, personal, business) | behavioral |
| `el:#btn-modal-focus-comment` | control | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-modal-follow-toggle` | control | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) | behavioral |
| `el:#btn-modal-like` | control | Likes, saves, comments and replies work on posts and notes (`10-engagement.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-modal-post-comment` | control | Likes, saves, comments and replies work on posts and notes (`10-engagement.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-modal-save` | control | Likes, saves, comments and replies work on posts and notes (`10-engagement.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-modal-share` | control | Feed, Explore and expanded post/reply detail all have the sparkle AI and share buttons (`08-sparkle-share.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#btn-note-fab` | control | E2E Notes & Explore: create note, search Explore Posts & Notes, open Discover Creators (`22-e2e-feed-explore-posts-notes.js`, personal) | behavioral |
| `el:#btn-note-modal-dm-share` | control | DM share, quick reactions, new-chat picker, and delete-thread confirm/cancel work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-note-modal-like` | control | Likes, saves, comments and replies work on posts and notes (`10-engagement.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-note-modal-pixai` | control | Feed, Explore and expanded post/reply detail all have the sparkle AI and share buttons (`08-sparkle-share.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-note-modal-save` | control | Likes, saves, comments and replies work on posts and notes (`10-engagement.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-note-modal-share` | control | Feed, Explore and expanded post/reply detail all have the sparkle AI and share buttons (`08-sparkle-share.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-notif-tab-all` | control | Fix 7b: grouped like row with stacked avatars, click marks the group read, Highlights/All toggle persists per account (`28-e2e-fixes.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-notif-tab-highlights` | control | Fix 7b: grouped like row with stacked avatars, click marks the group read, Highlights/All toggle persists per account (`28-e2e-fixes.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-open-business-verification` | control | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-open-create-modal` | control | Notifications, DMs and stories UI open (`13-notifications-dms-stories.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#btn-open-drafts-from-create` | control | E2E Drafts: save post & note drafts, resume into composer, cancel & confirm delete draft (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#btn-open-drafts-from-note` | control | E2E Drafts: save post & note drafts, resume into composer, cancel & confirm delete draft (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#btn-open-messages` | control | E2E DMs: send message, quick reaction, thread search, DM share, cancel & confirm delete thread (`24-e2e-dms-notifications-pixai.js`, personal) +1 more | behavioral |
| `el:#btn-pixai-edit-key` | control | E2E Pixlynote AI: open modal, key settings validation, offline mode, starter pills, chat submit (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `el:#btn-pixai-send` | control | E2E Pixlynote AI: open modal, key settings validation, offline mode, starter pills, chat submit (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `el:#btn-policy-tab-cookies` | control | Terms and policy tabs switch, and the support mailto link is valid (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-policy-tab-dmca` | control | Terms and policy tabs switch, and the support mailto link is valid (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-policy-tab-guidelines` | control | Terms and policy tabs switch, and the support mailto link is valid (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-policy-tab-privacy` | control | Terms and policy tabs switch, and the support mailto link is valid (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-policy-tab-tos` | control | Terms and policy tabs switch, and the support mailto link is valid (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-post-menu-copy` | control | Fix 6a: Feed ... menu Copy link really copies the post URL; own posts hide Not interested; Escape/outside click close it (`28-e2e-fixes.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-post-menu-feedback` | control | Fix 6c: Help > Submit feedback validates, sends to support@pixlynote.com via the Worker, and falls back to mailto (`28-e2e-fixes.js`, personal, pixlynote) | behavioral |
| `el:#btn-post-menu-help` | control | Fix 6c: Help > Submit feedback validates, sends to support@pixlynote.com via the Worker, and falls back to mailto (`28-e2e-fixes.js`, personal, pixlynote) | behavioral |
| `el:#btn-post-menu-not-interested` | control | Fix 6b: Not interested hides the post, down-ranks the author and tags for this account only, and Undo restores it (`28-e2e-fixes.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-post-note` | control | E2E Notes & Explore: create note, search Explore Posts & Notes, open Discover Creators (`22-e2e-feed-explore-posts-notes.js`, personal) | behavioral |
| `el:#btn-profile-avatar-edit` | control | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) +1 more | behavioral |
| `el:#btn-profile-complete-business-info` | control | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#btn-profile-contact-call` | control | E2E Profile links, contact buttons, Connections modals, and outbound mailto/Stripe links (`25-e2e-account-center-settings-links.js`, business) | behavioral |
| `el:#btn-profile-contact-email` | control | E2E Profile links, contact buttons, Connections modals, and outbound mailto/Stripe links (`25-e2e-account-center-settings-links.js`, business) | behavioral |
| `el:#btn-profile-create-post` | control | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) +1 more | behavioral |
| `el:#btn-profile-menu` | control | Owner menu: username with nothing under it, four items in order, no version footer (`04-owner-menu.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-profile-pic` | control | E2E Stories: create story -> viewer heart, reply, comments/viewers sheets, share-to-feed, delete story (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#btn-profile-row-menu` | control | Owner menu: username with nothing under it, four items in order, no version footer (`04-owner-menu.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-refresh-business-verifications` | control | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) +2 more | behavioral |
| `el:#btn-refresh-pending-deactivations` | control | Owner menu: User Base Metrics, Pending Deactivations, and Verification Requests are only at the top for @pixlynote (`04-owner-menu.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-refresh-user-metrics` | control | Owner menu: User Base Metrics, Pending Deactivations, and Verification Requests are only at the top for @pixlynote (`04-owner-menu.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-refresh-verification-requests` | control | Owner menu: User Base Metrics, Pending Deactivations, and Verification Requests are only at the top for @pixlynote (`04-owner-menu.js`, personal, business, empty, pixlynote) +3 more | behavioral |
| `el:#btn-save-edit-profile` | control | Edit Profile: username shows taken or available and Save stays off when taken (`03-edit-profile.js`, personal, business, empty, pixlynote) +12 more | behavioral |
| `el:#btn-save-note-draft` | control | E2E Drafts: save post & note drafts, resume into composer, cancel & confirm delete draft (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#btn-save-post-draft` | control | E2E Drafts: save post & note drafts, resume into composer, cancel & confirm delete draft (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#btn-share-profile` | control | E2E Profile links, contact buttons, Connections modals, and outbound mailto/Stripe links (`25-e2e-account-center-settings-links.js`, business) | behavioral |
| `el:#btn-share-user-profile` | control | Visitor profile buttons, contact links, tabs, and avatar open the expected surfaces (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-shuffle-discover-creators` | control | Explore refresh, Discover shuffle, header search, nav brand, and load-more all work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-signup-back-step1` | control | Sign-up: a verified email can create an account and open the app (`01-signup.js`, signed-out) +1 more | behavioral |
| `el:#btn-signup-complete` | control | Sign-up: a verified email can create an account and open the app (`01-signup.js`, signed-out) +1 more | behavioral |
| `el:#btn-signup-direct-submit` | control | Sign-up: a verified email can create an account and open the app (`01-signup.js`, signed-out) | behavioral |
| `el:#btn-signup-resend-email-code` | control | Sign-up: a free email shows the code verify step after Send code (`01-signup.js`, signed-out) | behavioral |
| `el:#btn-signup-resend-phone-code` | control | Sign-up: a free phone shows the code verify step after Send code (`01-signup.js`, signed-out) | behavioral |
| `el:#btn-signup-send-email-code` | control | Sign-up: taken email blocks Send code (`01-signup.js`, signed-out) | behavioral |
| `el:#btn-signup-send-phone-code` | control | Sign-up: taken phone blocks Send code (`01-signup.js`, signed-out) | behavioral |
| `el:#btn-signup-to-step2` | control | Sign-up: email and/or phone is required before continuing (`01-signup.js`, signed-out) | behavioral |
| `el:#btn-signup-verify-email-code` | control | Sign-up: a free email shows the code verify step after Send code (`01-signup.js`, signed-out) | behavioral |
| `el:#btn-signup-verify-phone-code` | control | Sign-up: a free phone shows the code verify step after Send code (`01-signup.js`, signed-out) | behavioral |
| `el:#btn-splash-get-started` | control | E2E Auth: Splash -> Business sign-up (DBA + Industry Other + Step 2 bio/link) -> Main view (`21-e2e-auth-and-onboarding.js`, signed-out) | behavioral |
| `el:#btn-splash-login` | control | Login: a seeded account can sign in with the correct password (`02-login.js`, signed-out) +1 more | behavioral |
| `el:#btn-story-delete` | control | E2E Stories: create story -> viewer heart, reply, comments/viewers sheets, share-to-feed, delete story (`23-e2e-stories-highlights-drafts.js`, personal) +1 more | behavioral |
| `el:#btn-story-next` | control | E2E Stories: create story -> viewer heart, reply, comments/viewers sheets, share-to-feed, delete story (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#btn-story-owner-comments` | control | E2E Stories: create story -> viewer heart, reply, comments/viewers sheets, share-to-feed, delete story (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#btn-story-owner-more` | control | E2E Stories: create story -> viewer heart, reply, comments/viewers sheets, share-to-feed, delete story (`23-e2e-stories-highlights-drafts.js`, personal) +1 more | behavioral |
| `el:#btn-story-owner-share` | control | Story share, more, prev/next, and reply-enter work for owner and viewer (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-story-prev` | control | E2E Stories: create story -> viewer heart, reply, comments/viewers sheets, share-to-feed, delete story (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#btn-story-save-photo` | control | E2E Stories: create story -> viewer heart, reply, comments/viewers sheets, share-to-feed, delete story (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#btn-story-send-heart` | control | E2E Stories: create story -> viewer heart, reply, comments/viewers sheets, share-to-feed, delete story (`23-e2e-stories-highlights-drafts.js`, personal) +1 more | behavioral |
| `el:#btn-story-send-reply` | control | E2E Stories: create story -> viewer heart, reply, comments/viewers sheets, share-to-feed, delete story (`23-e2e-stories-highlights-drafts.js`, personal) +1 more | behavioral |
| `el:#btn-story-share-to-feed` | control | E2E Stories: create story -> viewer heart, reply, comments/viewers sheets, share-to-feed, delete story (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#btn-story-viewer-comments` | control | E2E Stories: create story -> viewer heart, reply, comments/viewers sheets, share-to-feed, delete story (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#btn-story-viewer-more` | control | Story share, more, prev/next, and reply-enter work for owner and viewer (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-story-viewer-share` | control | Story share, more, prev/next, and reply-enter work for owner and viewer (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-story-viewers` | control | E2E Stories: create story -> viewer heart, reply, comments/viewers sheets, share-to-feed, delete story (`23-e2e-stories-highlights-drafts.js`, personal) +1 more | behavioral |
| `el:#btn-stripe-billing-portal` | control | Cancel period end: E2E: confirm dialog, period-end cancel keeps Plus, modal shows Plus ends on date (`34-cancel-period-end.js`, personal) +1 more | behavioral |
| `el:#btn-stripe-cancel-membership` | control | Cancel period end: E2E: confirm dialog, period-end cancel keeps Plus, modal shows Plus ends on date (`34-cancel-period-end.js`, personal) +1 more | behavioral |
| `el:#btn-submit-business-verification` | control | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#btn-submit-highlight` | control | E2E Highlights: create highlight -> update highlight -> delete highlight (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#btn-submit-post` | control | biz-display: E2E: own profile, viewed profile, Explore/search, and a new post show DBA when Display Name differs (`20-business-display-name.js`, personal) +1 more | behavioral |
| `el:#btn-submit-story` | control | Notifications, DMs and stories UI open (`13-notifications-dms-stories.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-submit-verification-request` | control | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#btn-subscription-open-business-verification` | control | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#btn-switcher-login` | control | Everything for the account switcher exists (`18-account-switcher.js`, personal, business, empty, pixlynote) +4 more | behavioral |
| `el:#btn-switcher-signup` | control | Everything for the account switcher exists (`18-account-switcher.js`, personal, business, empty, pixlynote) +4 more | behavioral |
| `el:#btn-toggle-auth-mode` | control | Login: a seeded account can sign in with the correct password (`02-login.js`, signed-out) | behavioral |
| `el:#btn-toggle-notifications` | control | E2E Notifications: open dropdown, verify unread, mark all read, close backdrop (`24-e2e-dms-notifications-pixai.js`, personal) +1 more | behavioral |
| `el:#btn-toggle-password` | control | Login: wrong password is rejected (`02-login.js`, signed-out) +1 more | behavioral |
| `el:#btn-toggle-signup-password` | control | E2E Auth: Splash -> Business sign-up (DBA + Industry Other + Step 2 bio/link) -> Main view (`21-e2e-auth-and-onboarding.js`, signed-out) | behavioral |
| `el:#btn-user-profile-cf-caret` | control | Visitor profile buttons, contact links, tabs, and avatar open the expected surfaces (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-user-profile-contact-call` | control | Visitor profile buttons, contact links, tabs, and avatar open the expected surfaces (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-user-profile-contact-email` | control | Visitor profile buttons, contact links, tabs, and avatar open the expected surfaces (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-user-profile-follow` | control | Profiles look identical to every viewer except the action buttons (`07-profile-parity.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#btn-user-profile-message` | control | Visitor profile buttons, contact links, tabs, and avatar open the expected surfaces (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-user-profile-more` | control | Visitor profile buttons, contact links, tabs, and avatar open the expected surfaces (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#btn-verification-paywall-subscribe` | control | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-verification-resend-email-code` | control | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-verification-send-email-code` | control | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#btn-verification-type-government` | control | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-verification-type-organization` | control | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#btn-verification-verify-email-code` | control | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#business-verification-admin-token` | input | Login: login fields keep username and current-password autocomplete, and the admin token is not a password field (`02-login.js`, signed-out) +3 more | behavioral |
| `el:#business-verification-form` | form | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#choose-photo-label` | control | Create Post and Edit Profile close buttons, caption helper, file inputs, and Close Friends toggles work without wiping the profile (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#create-caption-input` | input | E2E Post lifecycle: create post -> non-Plus edit paywall -> Plus edit post -> cancel & confirm delete post (`22-e2e-feed-explore-posts-notes.js`, personal, business) | behavioral |
| `el:#create-cf-only-toggle` | input | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) +1 more | behavioral |
| `el:#create-file-upload` | input | Create Post and Edit Profile close buttons, caption helper, file inputs, and Close Friends toggles work without wiping the profile (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#create-location-input` | input | E2E Post lifecycle: create post -> non-Plus edit paywall -> Plus edit post -> cancel & confirm delete post (`22-e2e-feed-explore-posts-notes.js`, personal, business) | behavioral |
| `el:#create-mode-tab-highlight` | control | E2E Highlights: create highlight -> update highlight -> delete highlight (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#create-mode-tab-post` | control | Create Post and Edit Profile close buttons, caption helper, file inputs, and Close Friends toggles work without wiping the profile (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#create-mode-tab-story` | control | Notifications, DMs and stories UI open (`13-notifications-dms-stories.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#create-post-form` | form | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) +1 more | behavioral |
| `el:#discover-creators-search-input` | input | Discover Creators shows only unconnected users, including in search (`09-discover.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#dm-file-input` | input | E2E DMs: send message, quick reaction, thread search, DM share, cancel & confirm delete thread (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `el:#dm-input-text` | input | E2E DMs: send message, quick reaction, thread search, DM share, cancel & confirm delete thread (`24-e2e-dms-notifications-pixai.js`, personal) +2 more | behavioral |
| `el:#dm-new-chat-search` | input | New Chat lists real connections, searches any real account, and the story viewer badges Close Friends (`13-notifications-dms-stories.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#dm-search-threads` | input | E2E DMs: send message, quick reaction, thread search, DM share, cancel & confirm delete thread (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `el:#dm-send-form` | form | E2E DMs: send message, quick reaction, thread search, DM share, cancel & confirm delete thread (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `el:#dm-share-note-input` | input | E2E DMs: send message, quick reaction, thread search, DM share, cancel & confirm delete thread (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `el:#dm-share-search` | input | E2E DMs: send message, quick reaction, thread search, DM share, cancel & confirm delete thread (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `el:#edit-content-location` | input | E2E Post lifecycle: create post -> non-Plus edit paywall -> Plus edit post -> cancel & confirm delete post (`22-e2e-feed-explore-posts-notes.js`, personal, business) | behavioral |
| `el:#edit-content-text` | input | E2E Post lifecycle: create post -> non-Plus edit paywall -> Plus edit post -> cancel & confirm delete post (`22-e2e-feed-explore-posts-notes.js`, personal, business) | behavioral |
| `el:#edit-content-text-label` | control | Create Post and Edit Profile close buttons, caption helper, file inputs, and Close Friends toggles work without wiping the profile (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#edit-profile-address-visibility` | input | Edit Profile: every stored field survives save, reload, and reopen on a business account (`03-edit-profile.js`, business, pixlynote) +1 more | behavioral |
| `el:#edit-profile-avatar-file` | input | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) +1 more | behavioral |
| `el:#edit-profile-bio` | input | Edit Profile: name, bio and website can be saved without a code when contact fields are unchanged (`03-edit-profile.js`, personal, business, empty, pixlynote) +5 more | behavioral |
| `el:#edit-profile-business-city` | input | Edit Profile: every stored field survives save, reload, and reopen on a business account (`03-edit-profile.js`, business, pixlynote) +4 more | behavioral |
| `el:#edit-profile-business-hours` | input | Edit Profile: every stored field survives save, reload, and reopen on a business account (`03-edit-profile.js`, business, pixlynote) +5 more | behavioral |
| `el:#edit-profile-business-industry` | input | Edit Profile: every stored field survives save, reload, and reopen on a business account (`03-edit-profile.js`, business, pixlynote) +7 more | behavioral |
| `el:#edit-profile-business-industry-other` | input | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#edit-profile-business-postal` | input | Edit Profile: every stored field survives save, reload, and reopen on a business account (`03-edit-profile.js`, business, pixlynote) +1 more | behavioral |
| `el:#edit-profile-business-state` | input | Edit Profile: every stored field survives save, reload, and reopen on a business account (`03-edit-profile.js`, business, pixlynote) +1 more | behavioral |
| `el:#edit-profile-business-street` | input | Edit Profile: every stored field survives save, reload, and reopen on a business account (`03-edit-profile.js`, business, pixlynote) +1 more | behavioral |
| `el:#edit-profile-dba-name` | input | Edit Profile: every stored field survives save, reload, and reopen on a business account (`03-edit-profile.js`, business, pixlynote) +7 more | behavioral |
| `el:#edit-profile-email` | input | Edit Profile: Send code appears on a changed email row (`03-edit-profile.js`, personal, business, empty, pixlynote) +7 more | behavioral |
| `el:#edit-profile-email-code` | input | Edit Profile: Send code appears on a changed email row (`03-edit-profile.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#edit-profile-form` | form | Edit Profile: name, bio and website can be saved without a code when contact fields are unchanged (`03-edit-profile.js`, personal, business, empty, pixlynote) +2 more | behavioral |
| `el:#edit-profile-link` | input | Edit Profile: name, bio and website can be saved without a code when contact fields are unchanged (`03-edit-profile.js`, personal, business, empty, pixlynote) +5 more | behavioral |
| `el:#edit-profile-name` | input | Edit Profile: name, bio and website can be saved without a code when contact fields are unchanged (`03-edit-profile.js`, personal, business, empty, pixlynote) +8 more | behavioral |
| `el:#edit-profile-phone` | input | Edit Profile: Send code appears on a changed phone row (`03-edit-profile.js`, personal, business, empty, pixlynote) +6 more | behavioral |
| `el:#edit-profile-phone-code` | input | Edit Profile: Send code appears on a changed phone row (`03-edit-profile.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#edit-profile-support-email` | input | Edit Profile: every stored field survives save, reload, and reopen on a business account (`03-edit-profile.js`, business, pixlynote) +5 more | behavioral |
| `el:#edit-profile-username` | input | Edit Profile: username shows taken or available and Save stays off when taken (`03-edit-profile.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#explore-search-input` | input | biz-display: E2E: own profile, viewed profile, Explore/search, and a new post show DBA when Display Name differs (`20-business-display-name.js`, personal) +1 more | behavioral |
| `el:#explore-tab-btn-notes` | control | E2E Notes & Explore: create note, search Explore Posts & Notes, open Discover Creators (`22-e2e-feed-explore-posts-notes.js`, personal) | behavioral |
| `el:#explore-tab-btn-posts` | control | E2E Notes & Explore: create note, search Explore Posts & Notes, open Discover Creators (`22-e2e-feed-explore-posts-notes.js`, personal) | behavioral |
| `el:#feedback-category` | input | Fix 6c: Help > Submit feedback validates, sends to support@pixlynote.com via the Worker, and falls back to mailto (`28-e2e-fixes.js`, personal, pixlynote) | behavioral |
| `el:#feedback-mailto-link` | control | Fix 6c: Help > Submit feedback validates, sends to support@pixlynote.com via the Worker, and falls back to mailto (`28-e2e-fixes.js`, personal, pixlynote) | behavioral |
| `el:#feedback-message` | input | Fix 6c: Help > Submit feedback validates, sends to support@pixlynote.com via the Worker, and falls back to mailto (`28-e2e-fixes.js`, personal, pixlynote) | behavioral |
| `el:#followers-search-input` | input | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#following-search-input` | input | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#forgot-confirm-password` | input | E2E Auth: Splash Login -> Password toggle -> Forgot Password E2E -> Login with new password -> Logout (`21-e2e-auth-and-onboarding.js`, signed-out) | behavioral |
| `el:#forgot-identifier` | input | E2E Auth: Splash Login -> Password toggle -> Forgot Password E2E -> Login with new password -> Logout (`21-e2e-auth-and-onboarding.js`, signed-out) | behavioral |
| `el:#forgot-new-password` | input | E2E Auth: Splash Login -> Password toggle -> Forgot Password E2E -> Login with new password -> Logout (`21-e2e-auth-and-onboarding.js`, signed-out) | behavioral |
| `el:#forgot-reset-code` | input | E2E Auth: Splash Login -> Password toggle -> Forgot Password E2E -> Login with new password -> Logout (`21-e2e-auth-and-onboarding.js`, signed-out) | behavioral |
| `el:#form-ac-change-password` | form | E2E Account Center: Account Info, Close Friends, Change Password, Security & Access, Privacy & Safety (`25-e2e-account-center-settings-links.js`, personal) | behavioral |
| `el:#form-edit-content` | form | E2E Post lifecycle: create post -> non-Plus edit paywall -> Plus edit post -> cancel & confirm delete post (`22-e2e-feed-explore-posts-notes.js`, personal, business) | behavioral |
| `el:#form-forgot-step-1` | form | E2E Auth: Splash Login -> Password toggle -> Forgot Password E2E -> Login with new password -> Logout (`21-e2e-auth-and-onboarding.js`, signed-out) | behavioral |
| `el:#form-forgot-step-2` | form | E2E Auth: Splash Login -> Password toggle -> Forgot Password E2E -> Login with new password -> Logout (`21-e2e-auth-and-onboarding.js`, signed-out) | behavioral |
| `el:#form-submit-feedback` | form | Fix 6c: Help > Submit feedback validates, sends to support@pixlynote.com via the Worker, and falls back to mailto (`28-e2e-fixes.js`, personal, pixlynote) | behavioral |
| `el:#header-search-input` | input | Explore refresh, Discover shuffle, header search, nav brand, and load-more all work (`38-uncovered-surfaces.js`, personal) +1 more | behavioral |
| `el:#help-center-support-mailto` | control | Item 7: Right-side (⋮) drawer has Help Center above Info/About with FAQs and Submit feedback + mailto fallback (`29-nov23-fixes.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#highlight-icon-input` | input | E2E Highlights: create highlight -> update highlight -> delete highlight (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#highlight-target-select` | input | E2E Highlights: create highlight -> update highlight -> delete highlight (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#highlight-title-input` | input | E2E Highlights: create highlight -> update highlight -> delete highlight (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#lbl-bizver-tax-id` | control | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#lbl-edit-profile-name` | control | Edit Profile: switching category starts the other type's name empty and requires a name to save (`03-edit-profile.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#lbl-signup-fullname` | control | Signed-out auth interactions do not wipe a previously stored account phone or email (`37-write-guards.js`, signed-out) | behavioral |
| `el:#lbl-signup-username` | control | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#likes-subtab-notes` | control | Liked and Saved show real Explore items, hide seed ids 1–6, and sort Saved newest first (`06-likes-saves.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#likes-subtab-photos` | control | Liked and Saved show real Explore items, hide seed ids 1–6, and sort Saved newest first (`06-likes-saves.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#login-email` | input | Sign-up: email and/or phone is required before continuing (`01-signup.js`, signed-out) | behavioral |
| `el:#login-form` | form | Login: empty credentials are rejected (`02-login.js`, signed-out) | behavioral |
| `el:#login-fullname` | input | Sign-up: email and/or phone is required before continuing (`01-signup.js`, signed-out) | behavioral |
| `el:#login-password` | input | Login: empty credentials are rejected (`02-login.js`, signed-out) +1 more | behavioral |
| `el:#login-username` | input | Login: empty credentials are rejected (`02-login.js`, signed-out) +1 more | behavioral |
| `el:#modal-comment-form` | form | Likes, saves, comments and replies work on posts and notes (`10-engagement.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#modal-comment-input` | input | Likes, saves, comments and replies work on posts and notes (`10-engagement.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#nav-brand-btn` | control | Explore refresh, Discover shuffle, header search, nav brand, and load-more all work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#nav-btn-create` | control | Notifications, DMs and stories UI open (`13-notifications-dms-stories.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#nav-btn-explore` | control | Feed, Explore and expanded post/reply detail all have the sparkle AI and share buttons (`08-sparkle-share.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#nav-btn-feed` | control | Feed, Explore and expanded post/reply detail all have the sparkle AI and share buttons (`08-sparkle-share.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#nav-btn-pixai` | control | Feed, Explore and expanded post/reply detail all have the sparkle AI and share buttons (`08-sparkle-share.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#nav-btn-profile` | control | Login: password fields are cleared and the login form is removed after sign-in, including on the Profile tab (`02-login.js`, signed-out) +2 more | behavioral |
| `el:#note-cf-only-toggle` | input | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) +1 more | behavioral |
| `el:#note-compose-form` | form | E2E Notes & Explore: create note, search Explore Posts & Notes, open Discover Creators (`22-e2e-feed-explore-posts-notes.js`, personal) | behavioral |
| `el:#note-input-text` | input | E2E Notes & Explore: create note, search Explore Posts & Notes, open Discover Creators (`22-e2e-feed-explore-posts-notes.js`, personal) | behavioral |
| `el:#note-modal-comment-form` | form | Likes, saves, comments and replies work on posts and notes (`10-engagement.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#note-modal-comment-input` | input | Likes, saves, comments and replies work on posts and notes (`10-engagement.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#notifications-backdrop` | control | E2E Notifications: open dropdown, verify unread, mark all read, close backdrop (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `el:#pixai-backdrop` | control | E2E Pixlynote AI: open modal, key settings validation, offline mode, starter pills, chat submit (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `el:#pixai-chat-form` | form | E2E Pixlynote AI: open modal, key settings validation, offline mode, starter pills, chat submit (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `el:#pixai-chat-input` | input | E2E Pixlynote AI: open modal, key settings validation, offline mode, starter pills, chat submit (`24-e2e-dms-notifications-pixai.js`, personal) +1 more | behavioral |
| `el:#pixai-drag-handle` | control | E2E Pixlynote AI: open modal, key settings validation, offline mode, starter pills, chat submit (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `el:#pixai-setup-key-input` | input | E2E Pixlynote AI: open modal, key settings validation, offline mode, starter pills, chat submit (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `el:#pixly-stripe-business-buy-btn` | control | Business Plus is offered to business accounts and paints a green check, never Plus blue (`11-subscription.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#pixly-stripe-buy-btn` | control | Switching Business Plus to Personal cancels Business Plus, hides an approved org badge, and restores it after Plus (`16-gov-org-verification.js`, business) +1 more | behavioral |
| `el:#profile-avatar-container` | control | E2E Stories: create story -> viewer heart, reply, comments/viewers sheets, share-to-feed, delete story (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `el:#profile-avatar-direct-upload` | input | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) | behavioral |
| `el:#profile-contact-hint` | control | Visitor profile buttons, contact links, tabs, and avatar open the expected surfaces (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#profile-contact-support` | control | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#profile-contact-website` | control | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) +2 more | behavioral |
| `el:#profile-drawer-backdrop` | control | Owner menu, settings, subscription, metrics, and profile-drawer backdrop work (`38-uncovered-surfaces.js`, personal, pixlynote) | behavioral |
| `el:#profile-link` | control | Visitor profile buttons, contact links, tabs, and avatar open the expected surfaces (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#saved-subtab-notes` | control | Liked and Saved show real Explore items, hide seed ids 1–6, and sort Saved newest first (`06-likes-saves.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#saved-subtab-photos` | control | Liked and Saved show real Explore items, hide seed ids 1–6, and sort Saved newest first (`06-likes-saves.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#signup-avatar-file-input` | input | Signed-out auth interactions do not wipe a previously stored account phone or email (`37-write-guards.js`, signed-out) | behavioral |
| `el:#signup-bio` | input | Sign-up: a verified email can create an account and open the app (`01-signup.js`, signed-out) +1 more | behavioral |
| `el:#signup-business-industry` | input | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) +2 more | behavioral |
| `el:#signup-business-industry-other` | input | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) +2 more | behavioral |
| `el:#signup-dba-name` | input | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) +2 more | behavioral |
| `el:#signup-email-code` | input | Sign-up: a free email shows the code verify step after Send code (`01-signup.js`, signed-out) | behavioral |
| `el:#signup-link` | input | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#signup-password` | input | Sign-up: email and/or phone is required before continuing (`01-signup.js`, signed-out) | behavioral |
| `el:#signup-phone` | input | Sign-up: email and/or phone is required before continuing (`01-signup.js`, signed-out) | behavioral |
| `el:#signup-phone-code` | input | Sign-up: a free phone shows the code verify step after Send code (`01-signup.js`, signed-out) | behavioral |
| `el:#signup-username` | input | Sign-up: email and/or phone is required before continuing (`01-signup.js`, signed-out) | behavioral |
| `el:#stat-followers-btn` | control | E2E Profile links, contact buttons, Connections modals, and outbound mailto/Stripe links (`25-e2e-account-center-settings-links.js`, business) | behavioral |
| `el:#stat-following-btn` | control | UI follow/unfollow sticks across stale snapshots, reload, both profile modals, and seed creators (`19-follow-connections.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#story-reply-input` | input | E2E Stories: create story -> viewer heart, reply, comments/viewers sheets, share-to-feed, delete story (`23-e2e-stories-highlights-drafts.js`, personal) +1 more | behavioral |
| `el:#switch-password-input` | input | Everything for the account switcher exists (`18-account-switcher.js`, personal, business, empty, pixlynote) +2 more | behavioral |
| `el:#tab-auth-login` | control | Login: empty credentials are rejected (`02-login.js`, signed-out) | behavioral |
| `el:#tab-auth-signup` | control | Sign-up: email and/or phone is required before continuing (`01-signup.js`, signed-out) | behavioral |
| `el:#tab-btn-likes` | control | Owner tab row: Posts, Notes, Replies, Saved and Likes with count badges, at 390px and 360px (`05-owner-tabs.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#tab-btn-notes` | control | Owner tab row: Posts, Notes, Replies, Saved and Likes with count badges, at 390px and 360px (`05-owner-tabs.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#tab-btn-posts` | control | Owner tab row: Posts, Notes, Replies, Saved and Likes with count badges, at 390px and 360px (`05-owner-tabs.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#tab-btn-replies` | control | Owner tab row: Posts, Notes, Replies, Saved and Likes with count badges, at 390px and 360px (`05-owner-tabs.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#tab-btn-saved` | control | Owner tab row: Posts, Notes, Replies, Saved and Likes with count badges, at 390px and 360px (`05-owner-tabs.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#toast-action` | control | Fix 6b: Not interested hides the post, down-ranks the author and tags for this account only, and Undo restores it (`28-e2e-fixes.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#user-profile-avatar-container` | control | Visitor profile buttons, contact links, tabs, and avatar open the expected surfaces (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#user-profile-contact-support` | control | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#user-profile-contact-website` | control | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#user-profile-link` | control | Visitor profile buttons, contact links, tabs, and avatar open the expected surfaces (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:#user-stat-followers-btn` | control | UI follow/unfollow sticks across stale snapshots, reload, both profile modals, and seed creators (`19-follow-connections.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:#user-stat-following-btn` | control | E2E Profile links, contact buttons, Connections modals, and outbound mailto/Stripe links (`25-e2e-account-center-settings-links.js`, business) | behavioral |
| `el:#user-tab-btn-notes` | control | Visitor tab row: non-owners do not see Saved or Likes (`05-owner-tabs.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#user-tab-btn-posts` | control | Visitor tab row: non-owners do not see Saved or Likes (`05-owner-tabs.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#user-tab-btn-replies` | control | Visitor tab row: non-owners do not see Saved or Likes (`05-owner-tabs.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#verification-email-code` | input | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#verification-entity-name` | input | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#verification-notes` | input | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#verification-official-email` | input | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#verification-org-ein` | input | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `el:#verification-website-url` | input | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `el:a[onclick=none]` | control | Inventory artifact controls (onclick=none, getElementById, stopPropagation) stay present and do not throw (`38-uncovered-surfaces.js`, personal, signed-out) | behavioral |
| `el:button[onclick=activateOfflinePixaiMode]` | control | Pixlynote AI header button, close, offline mode, and API key save work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:button[onclick=cancelDeleteDmThread]` | control | DM share, quick reactions, new-chat picker, and delete-thread confirm/cancel work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:button[onclick=closeDmShareModal]` | control | DM share, quick reactions, new-chat picker, and delete-thread confirm/cancel work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:button[onclick=closeEditContentModal]` | control | Create Post and Edit Profile close buttons, caption helper, file inputs, and Close Friends toggles work without wiping the profile (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:button[onclick=closePixaiModal]` | control | Pixlynote AI header button, close, offline mode, and API key save work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:button[onclick=closeProfileMenu]` | control | Owner menu, settings, subscription, metrics, and profile-drawer backdrop work (`38-uncovered-surfaces.js`, personal, pixlynote) | behavioral |
| `el:button[onclick=closeSubscriptionModal]` | control | Owner menu, settings, subscription, metrics, and profile-drawer backdrop work (`38-uncovered-surfaces.js`, personal, pixlynote) | behavioral |
| `el:button[onclick=closeTermsPoliciesModal]` | control | Terms and policy tabs switch, and the support mailto link is valid (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:button[onclick=confirmDeleteDmThread]` | control | DM share, quick reactions, new-chat picker, and delete-thread confirm/cancel work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:button[onclick=getElementById]` | control | Inventory artifact controls (onclick=none, getElementById, stopPropagation) stay present and do not throw (`38-uncovered-surfaces.js`, personal, signed-out) | behavioral |
| `el:button[onclick=handleDrawerAccountCenterClick]` | control | Owner menu, settings, subscription, metrics, and profile-drawer backdrop work (`38-uncovered-surfaces.js`, personal, pixlynote) | behavioral |
| `el:button[onclick=handleDrawerLogoutClick]` | control | Logout from Account Info leaves the stored phone and email in place so the next login can restore them (`37-write-guards.js`, personal) | behavioral |
| `el:button[onclick=handleDrawerProfileClick]` | control | Owner menu, settings, subscription, metrics, and profile-drawer backdrop work (`38-uncovered-surfaces.js`, personal, pixlynote) | behavioral |
| `el:button[onclick=handleDrawerSubscriptionClick]` | control | Owner menu, settings, subscription, metrics, and profile-drawer backdrop work (`38-uncovered-surfaces.js`, personal, pixlynote) | behavioral |
| `el:button[onclick=handleDrawerTermsClick]` | control | Terms and policy tabs switch, and the support mailto link is valid (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:button[onclick=none]` | control | Inventory artifact controls (onclick=none, getElementById, stopPropagation) stay present and do not throw (`38-uncovered-surfaces.js`, personal, signed-out) | behavioral |
| `el:button[onclick=savePixaiApiKey]` | control | Pixlynote AI header button, close, offline mode, and API key save work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:button[onclick=sendDmQuickReaction]` | control | DM share, quick reactions, new-chat picker, and delete-thread confirm/cancel work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:button[onclick=toggleDmNewChatPicker]` | control | DM share, quick reactions, new-chat picker, and delete-thread confirm/cancel work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `el:button[onclick=toggleDrawerSettingsInfo]` | control | Owner menu, settings, subscription, metrics, and profile-drawer backdrop work (`38-uncovered-surfaces.js`, personal, pixlynote) | behavioral |
| `el:button[onclick=toggleDrawerUserMetricsList]` | control | Owner menu, settings, subscription, metrics, and profile-drawer backdrop work (`38-uncovered-surfaces.js`, personal, pixlynote) | behavioral |
| `el:button[onclick=togglePasswordVisibility]` | control | Signed-out auth interactions do not wipe a previously stored account phone or email (`37-write-guards.js`, signed-out) | behavioral |
| `el:label[onclick=none]` | control | Inventory artifact controls (onclick=none, getElementById, stopPropagation) stay present and do not throw (`38-uncovered-surfaces.js`, personal, signed-out) | behavioral |
| `handler:activateOfflinePixaiMode` | handler | E2E Pixlynote AI: open modal, key settings validation, offline mode, starter pills, chat submit (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `handler:approveVerificationRequest` | handler | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `handler:cancelDeleteDmThread` | handler | E2E DMs: send message, quick reaction, thread search, DM share, cancel & confirm delete thread (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `handler:closeAccountTypeSwitchConfirm` | handler | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:closeBusinessVerificationModal` | handler | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:closeDmShareModal` | handler | E2E DMs: send message, quick reaction, thread search, DM share, cancel & confirm delete thread (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `handler:closeEditContentModal` | handler | E2E Post lifecycle: create post -> non-Plus edit paywall -> Plus edit post -> cancel & confirm delete post (`22-e2e-feed-explore-posts-notes.js`, personal, business) +1 more | behavioral |
| `handler:closeHelpCenterModal` | handler | Item 7: Right-side (⋮) drawer has Help Center above Info/About with FAQs and Submit feedback + mailto fallback (`29-nov23-fixes.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:closeMessagesModal` | handler | Notifications, DMs and stories UI open (`13-notifications-dms-stories.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:closeNoteDetailModal` | handler | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:closePixaiModal` | handler | Feed, Explore and expanded post/reply detail all have the sparkle AI and share buttons (`08-sparkle-share.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `handler:closePostDetailModal` | handler | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:closeProfileMenu` | handler | Owner menu, settings, subscription, metrics, and profile-drawer backdrop work (`38-uncovered-surfaces.js`, personal, pixlynote) | behavioral |
| `handler:closeSubmitFeedbackModal` | handler | Terms and policy tabs switch, and the support mailto link is valid (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:closeSubscriptionModal` | handler | Subscription and Stripe sandbox entry points exist (`11-subscription.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:closeTermsPoliciesModal` | handler | Settings and info and Info & about open their content (`12-settings-info.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:closeVerificationBadgesModal` | handler | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:closeVerificationPaywall` | handler | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:closeVerificationRequestModal` | handler | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:confirmAccountTypeSwitch` | handler | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) +2 more | behavioral |
| `handler:confirmDeleteDmThread` | handler | E2E DMs: send message, quick reaction, thread search, DM share, cancel & confirm delete thread (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `handler:copyToClipboard` | handler | Post and note menus, copy, not-interested, spam, and double-tap like work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:decideBusinessVerification` | handler | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:deleteProfileReplyItem` | handler | Post and note menus, copy, not-interested, spam, and double-tap like work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:exploreLoadMore` | handler | Explore refresh, Discover shuffle, header search, nav brand, and load-more all work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:exploreToggleFollow` | handler | Explore refresh, Discover shuffle, header search, nav brand, and load-more all work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:filterDmCreators` | handler | New Chat lists real connections, searches any real account, and the story viewer badges Close Friends (`13-notifications-dms-stories.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:filterDmThreads` | handler | E2E DMs: send message, quick reaction, thread search, DM share, cancel & confirm delete thread (`24-e2e-dms-notifications-pixai.js`, personal) +1 more | behavioral |
| `handler:getElementById` | handler | Inventory artifact controls (onclick=none, getElementById, stopPropagation) stay present and do not throw (`38-uncovered-surfaces.js`, personal, signed-out) | behavioral |
| `handler:goToSubscriptionFromVerificationPaywall` | handler | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:handleCreateHighlightAction` | handler | E2E Highlights: create highlight -> update highlight -> delete highlight (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `handler:handleDeleteNoteAction` | handler | Post and note menus, copy, not-interested, spam, and double-tap like work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:handleDeleteSelectedHighlight` | handler | E2E Highlights: create highlight -> update highlight -> delete highlight (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `handler:handleDmMobileBack` | handler | Fix 2/8: DMs thread row + Chat open the chat panel on desktop and mobile; filterDmThreads tolerates missing fields (`28-e2e-fixes.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:handleDmPhotoSelected` | handler | E2E DMs: send message, quick reaction, thread search, DM share, cancel & confirm delete thread (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `handler:handleDmViewProfile` | handler | E2E DMs: send message, quick reaction, thread search, DM share, cancel & confirm delete thread (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `handler:handleDrawerAccountCenterClick` | handler | Settings and info and Info & about open their content (`12-settings-info.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `handler:handleDrawerLogoutClick` | handler | Settings and info and Info & about open their content (`12-settings-info.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:handleDrawerProfileClick` | handler | Owner menu: username with nothing under it, four items in order, no version footer (`04-owner-menu.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:handleDrawerSubscriptionClick` | handler | Owner menu: username with nothing under it, four items in order, no version footer (`04-owner-menu.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `handler:handleDrawerTermsClick` | handler | Settings and info and Info & about open their content (`12-settings-info.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:handleInstantExploreRefresh` | handler | Explore refresh, Discover shuffle, header search, nav brand, and load-more all work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:handleNavExploreClick` | handler | Explore refresh, Discover shuffle, header search, nav brand, and load-more all work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:handleNoteModalLikeToggle` | handler | Likes, saves, comments and replies work on posts and notes (`10-engagement.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:handleNoteModalSaveToggle` | handler | Likes, saves, comments and replies work on posts and notes (`10-engagement.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:handleNoteModalShare` | handler | Feed, Explore and expanded post/reply detail all have the sparkle AI and share buttons (`08-sparkle-share.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:handlePostMenuCopy` | handler | Post and note menus, copy, not-interested, spam, and double-tap like work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:handlePostMenuNotInterested` | handler | Post and note menus, copy, not-interested, spam, and double-tap like work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:handleSendDirectMessage` | handler | E2E DMs: send message, quick reaction, thread search, DM share, cancel & confirm delete thread (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `handler:markAllNotificationsRead` | handler | Notifications, DMs and stories UI open (`13-notifications-dms-stories.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `handler:nextStorySlide` | handler | Story share, more, prev/next, and reply-enter work for owner and viewer (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:openBusinessVerificationModal` | handler | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:openContactPreferences` | handler | Account Center info tabs, contact visibility, history, 2FA, and Drafts all open the right panel (`38-uncovered-surfaces.js`, personal, business) | behavioral |
| `handler:openCreatePostModal` | handler | Notifications, DMs and stories UI open (`13-notifications-dms-stories.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:openDmShareModal` | handler | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) +1 more | behavioral |
| `handler:openEditNoteModal` | handler | Post and note menus, copy, not-interested, spam, and double-tap like work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:openEditProfileModal` | handler | Edit Profile: Send code appears on a changed email row (`03-edit-profile.js`, personal, business, empty, pixlynote) +4 more | behavioral |
| `handler:openHelpCenterFeedback` | handler | Item 7: Right-side (⋮) drawer has Help Center above Info/About with FAQs and Submit feedback + mailto fallback (`29-nov23-fixes.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:openHelpCenterModal` | handler | Item 7: Right-side (⋮) drawer has Help Center above Info/About with FAQs and Submit feedback + mailto fallback (`29-nov23-fixes.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:openNoteDetailModal` | handler | Feed, Explore and expanded post/reply detail all have the sparkle AI and share buttons (`08-sparkle-share.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:openPixaiModal` | handler | Feed, Explore and expanded post/reply detail all have the sparkle AI and share buttons (`08-sparkle-share.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:openPixaiWithContentFromEl` | handler | Feed, Explore and expanded post/reply detail all have the sparkle AI and share buttons (`08-sparkle-share.js`, personal, business, empty, pixlynote) +2 more | behavioral |
| `handler:openPostDetailModal` | handler | Feed, Explore and expanded post/reply detail all have the sparkle AI and share buttons (`08-sparkle-share.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `handler:openProfileInfoAbout` | handler | Owner menu: username with nothing under it, four items in order, no version footer (`04-owner-menu.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:openProfileMenu` | handler | Owner menu: username with nothing under it, four items in order, no version footer (`04-owner-menu.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:openSubmitFeedbackModal` | handler | Terms and policy tabs switch, and the support mailto link is valid (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:openViewedConnectionsList` | handler | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:prevStorySlide` | handler | Story share, more, prev/next, and reply-enter work for owner and viewer (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:promptBusinessVerificationMoreInfo` | handler | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:promptBusinessVerificationReject` | handler | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:refreshBusinessVerificationAdmin` | handler | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) +2 more | behavioral |
| `handler:refreshDrawerUserMetrics` | handler | Owner menu: User Base Metrics, Pending Deactivations, and Verification Requests are only at the top for @pixlynote (`04-owner-menu.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:refreshPendingDeactivations` | handler | Owner menu: User Base Metrics, Pending Deactivations, and Verification Requests are only at the top for @pixlynote (`04-owner-menu.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:refreshVerificationRequests` | handler | Owner menu: User Base Metrics, Pending Deactivations, and Verification Requests are only at the top for @pixlynote (`04-owner-menu.js`, personal, business, empty, pixlynote) +2 more | behavioral |
| `handler:rejectVerificationRequest` | handler | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `handler:renderCaptionSuggestions` | handler | Create Post and Edit Profile close buttons, caption helper, file inputs, and Close Friends toggles work without wiping the profile (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:renderDmShareChatHeads` | handler | E2E DMs: send message, quick reaction, thread search, DM share, cancel & confirm delete thread (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `handler:renderProfileHistoryPanel` | handler | Account Center info tabs, contact visibility, history, 2FA, and Drafts all open the right panel (`38-uncovered-surfaces.js`, personal, business) | behavioral |
| `handler:requestDeleteDmThread` | handler | E2E DMs: send message, quick reaction, thread search, DM share, cancel & confirm delete thread (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `handler:saveEditedContent` | handler | E2E Post lifecycle: create post -> non-Plus edit paywall -> Plus edit post -> cancel & confirm delete post (`22-e2e-feed-explore-posts-notes.js`, personal, business) | behavioral |
| `handler:savePixaiApiKey` | handler | E2E Pixlynote AI: open modal, key settings validation, offline mode, starter pills, chat submit (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `handler:selectCreatorForDm` | handler | New Chat lists real connections, searches any real account, and the story viewer badges Close Friends (`13-notifications-dms-stories.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:sendBusinessVerificationEmailCode` | handler | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:sendDmQuickReaction` | handler | E2E DMs: send message, quick reaction, thread search, DM share, cancel & confirm delete thread (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `handler:sendDmShareToSelected` | handler | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) +1 more | behavioral |
| `handler:sendVerificationEmailCode` | handler | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:setAccountInfoTab` | handler | Account Center info tabs, contact visibility, history, 2FA, and Drafts all open the right panel (`38-uncovered-surfaces.js`, personal, business) | behavioral |
| `handler:setCreateWizardMode` | handler | Notifications, DMs and stories UI open (`13-notifications-dms-stories.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `handler:setGovernmentBadgeColor` | handler | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `handler:setNotificationMode` | handler | Fix 7b: grouped like row with stacked avatars, click marks the group read, Highlights/All toggle persists per account (`28-e2e-fixes.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:setVerificationRequestType` | handler | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:startReplyToNoteComment` | handler | Likes, saves, comments and replies work on posts and notes (`10-engagement.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:startReplyToPostComment` | handler | Likes, saves, comments and replies work on posts and notes (`10-engagement.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:stopPropagation` | handler | Inventory artifact controls (onclick=none, getElementById, stopPropagation) stay present and do not throw (`38-uncovered-surfaces.js`, personal, signed-out) | behavioral |
| `handler:submitBusinessVerificationApplication` | handler | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `handler:submitNoteModalComment` | handler | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) | behavioral |
| `handler:submitPixaiMessage` | handler | E2E Pixlynote AI: open modal, key settings validation, offline mode, starter pills, chat submit (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `handler:submitPostFeedback` | handler | Fix 6c: Help > Submit feedback validates, sends to support@pixlynote.com via the Worker, and falls back to mailto (`28-e2e-fixes.js`, personal, pixlynote) | behavioral |
| `handler:submitVerificationRequest` | handler | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:suggestCaptionsWithGemini` | handler | Create Post and Edit Profile close buttons, caption helper, file inputs, and Close Friends toggles work without wiping the profile (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:switchPolicyTab` | handler | Settings and info and Info & about open their content (`12-settings-info.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:syncBusinessVerificationAdminLoadBtn` | handler | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `handler:toggleCommentSpam` | handler | Post and note menus, copy, not-interested, spam, and double-tap like work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:toggleContactPref` | handler | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) +2 more | behavioral |
| `handler:toggleDmNewChatPicker` | handler | New Chat lists real connections, searches any real account, and the story viewer badges Close Friends (`13-notifications-dms-stories.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:toggleDmShareUser` | handler | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) +1 more | behavioral |
| `handler:toggleDrawerSettingsInfo` | handler | Owner menu: username with nothing under it, four items in order, no version footer (`04-owner-menu.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:toggleDrawerUserMetricsList` | handler | Owner menu: User Base Metrics, Pending Deactivations, and Verification Requests are only at the top for @pixlynote (`04-owner-menu.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `handler:toggleLikeNote` | handler | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) +1 more | behavioral |
| `handler:toggleLikeNoteComment` | handler | Likes, saves, comments and replies work on posts and notes (`10-engagement.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:toggleLikePostComment` | handler | Likes, saves, comments and replies work on posts and notes (`10-engagement.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:toggleNotificationsDropdown` | handler | Notifications, DMs and stories UI open (`13-notifications-dms-stories.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `handler:togglePasswordVisibility` | handler | E2E Pixlynote AI: open modal, key settings validation, offline mode, starter pills, chat submit (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `handler:togglePixaiKeySettings` | handler | E2E Pixlynote AI: open modal, key settings validation, offline mode, starter pills, chat submit (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `handler:togglePostMenuHelp` | handler | Post and note menus, copy, not-interested, spam, and double-tap like work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:toggleSaveNote` | handler | Liked and Saved show real Explore items, hide seed ids 1–6, and sort Saved newest first (`06-likes-saves.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:toggleSavePost` | handler | Liked and Saved show real Explore items, hide seed ids 1–6, and sort Saved newest first (`06-likes-saves.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:toggleSpamFolder` | handler | Post and note menus, copy, not-interested, spam, and double-tap like work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:toggleStoryCommentSpam` | handler | Story share, more, prev/next, and reply-enter work for owner and viewer (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:triggerDmPhotoChooser` | handler | E2E DMs: send message, quick reaction, thread search, DM share, cancel & confirm delete thread (`24-e2e-dms-notifications-pixai.js`, personal) | behavioral |
| `handler:unflagSpamUser` | handler | Post and note menus, copy, not-interested, spam, and double-tap like work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `handler:updateHighlightNewFieldsVisibility` | handler | E2E Highlights: create highlight -> update highlight -> delete highlight (`23-e2e-stories-highlights-drafts.js`, personal) | behavioral |
| `handler:verifyBusinessVerificationEmailCode` | handler | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:verifyVerificationEmailCode` | handler | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `handler:viewUserProfile` | handler | Profiles look identical to every viewer except the action buttons (`07-profile-parity.js`, personal, business, empty, pixlynote) +2 more | behavioral |
| `href:https://billing.stripe.com/p/login/test_8x29AT6WvgHZ5Dc7QggQE00` | href | Subscription and Stripe sandbox entry points exist (`11-subscription.js`, personal, business, empty, pixlynote) | behavioral |
| `href:mailto:bradley.g.hansen@hotmail.com` | href | E2E Profile links, contact buttons, Connections modals, and outbound mailto/Stripe links (`25-e2e-account-center-settings-links.js`, business) | behavioral |
| `href:mailto:dmca@pixlynote.com` | href | E2E Profile links, contact buttons, Connections modals, and outbound mailto/Stripe links (`25-e2e-account-center-settings-links.js`, business) | behavioral |
| `href:mailto:privacy@pixlynote.com` | href | E2E Profile links, contact buttons, Connections modals, and outbound mailto/Stripe links (`25-e2e-account-center-settings-links.js`, business) | behavioral |
| `href:mailto:support@pixlynote.com` | href | Terms and policy tabs switch, and the support mailto link is valid (`38-uncovered-surfaces.js`, personal) | behavioral |
| `href:mailto:support@pixlynote.com?subject=Pixlynote%20Support` | href | Item 7: Right-side (⋮) drawer has Help Center above Info/About with FAQs and Submit feedback + mailto fallback (`29-nov23-fixes.js`, personal, business, empty, pixlynote) | behavioral |
| `listener:#ac-blocked-search:input` | listener | Interaction: ac-blocked-search input [listener:#ac-blocked-search:input] | auto |
| `listener:#ac-cf-add-form:submit` | listener | Interaction: ac-cf-add-form submit [listener:#ac-cf-add-form:submit] | auto |
| `listener:#ac-cf-search:input` | listener | Interaction: ac-cf-search input [listener:#ac-cf-search:input] | auto |
| `listener:#ac-muted-search:input` | listener | Interaction: ac-muted-search input [listener:#ac-muted-search:input] | auto |
| `listener:#btn-ac-back:click` | listener | Interaction: btn-ac-back click [listener:#btn-ac-back:click] | auto |
| `listener:#btn-ac-cancel-logout-others:click` | listener | Interaction: btn-ac-cancel-logout-others click [listener:#btn-ac-cancel-logout-others:click] | auto |
| `listener:#btn-ac-cf-add:click` | listener | Interaction: btn-ac-cf-add click [listener:#btn-ac-cf-add:click] | auto |
| `listener:#btn-ac-confirm-logout-others:click` | listener | Interaction: btn-ac-confirm-logout-others click [listener:#btn-ac-confirm-logout-others:click] | auto |
| `listener:#btn-ac-deactivate-account:click` | listener | Interaction: btn-ac-deactivate-account click [listener:#btn-ac-deactivate-account:click] | auto |
| `listener:#btn-ac-grant-privileged:click` | listener | Interaction: btn-ac-grant-privileged click [listener:#btn-ac-grant-privileged:click] | auto |
| `listener:#btn-ac-info-logout:click` | listener | Logout from Account Info leaves the stored phone and email in place so the next login can restore them (`37-write-guards.js`, personal) | behavioral |
| `listener:#btn-ac-invite-associate:click` | listener | Interaction: btn-ac-invite-associate click [listener:#btn-ac-invite-associate:click] | auto |
| `listener:#btn-ac-leave-associated-business:click` | listener | Interaction: btn-ac-leave-associated-business click [listener:#btn-ac-leave-associated-business:click] | auto |
| `listener:#btn-ac-log-filter-all:click` | listener | Interaction: btn-ac-log-filter-all click [listener:#btn-ac-log-filter-all:click] | auto |
| `listener:#btn-ac-log-filter-login:click` | listener | Interaction: btn-ac-log-filter-login click [listener:#btn-ac-log-filter-login:click] | auto |
| `listener:#btn-ac-log-filter-password:click` | listener | Interaction: btn-ac-log-filter-password click [listener:#btn-ac-log-filter-password:click] | auto |
| `listener:#btn-ac-login:click` | listener | Account Center Login and Sign up, Drafts list, and Likes/Saved panels respond to clicks without wiping profile data (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-ac-logout-other-sessions:click` | listener | Interaction: btn-ac-logout-other-sessions click [listener:#btn-ac-logout-other-sessions:click] | auto |
| `listener:#btn-ac-open-2fa:click` | listener | Account Center info tabs, contact visibility, history, 2FA, and Drafts all open the right panel (`38-uncovered-surfaces.js`, personal, business) | behavioral |
| `listener:#btn-ac-open-login-activity:click` | listener | Interaction: btn-ac-open-login-activity click [listener:#btn-ac-open-login-activity:click] | auto |
| `listener:#btn-ac-open-sessions:click` | listener | Interaction: btn-ac-open-sessions click [listener:#btn-ac-open-sessions:click] | auto |
| `listener:#btn-ac-open-your-account:click` | listener | Interaction: btn-ac-open-your-account click [listener:#btn-ac-open-your-account:click] | auto |
| `listener:#btn-ac-sa-tab-apps-sessions:click` | listener | Interaction: btn-ac-sa-tab-apps-sessions click [listener:#btn-ac-sa-tab-apps-sessions:click] | auto |
| `listener:#btn-ac-sa-tab-security:click` | listener | Interaction: btn-ac-sa-tab-security click [listener:#btn-ac-sa-tab-security:click] | auto |
| `listener:#btn-ac-signup:click` | listener | Account Center Login and Sign up, Drafts list, and Likes/Saved panels respond to clicks without wiping profile data (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-ac-tab-account-info:click` | listener | Interaction: btn-ac-tab-account-info click [listener:#btn-ac-tab-account-info:click] | auto |
| `listener:#btn-ac-tab-associate:click` | listener | Interaction: btn-ac-tab-associate click [listener:#btn-ac-tab-associate:click] | auto |
| `listener:#btn-ac-tab-blocked:click` | listener | Interaction: btn-ac-tab-blocked click [listener:#btn-ac-tab-blocked:click] | auto |
| `listener:#btn-ac-tab-change-password:click` | listener | Interaction: btn-ac-tab-change-password click [listener:#btn-ac-tab-change-password:click] | auto |
| `listener:#btn-ac-tab-close-friends:click` | listener | Interaction: btn-ac-tab-close-friends click [listener:#btn-ac-tab-close-friends:click] | auto |
| `listener:#btn-ac-tab-drafts:click` | listener | Account Center info tabs, contact visibility, history, 2FA, and Drafts all open the right panel (`38-uncovered-surfaces.js`, personal, business) | behavioral |
| `listener:#btn-ac-tab-muted:click` | listener | Interaction: btn-ac-tab-muted click [listener:#btn-ac-tab-muted:click] | auto |
| `listener:#btn-ac-tab-privacy-safety:click` | listener | Account Center info tabs, contact visibility, history, 2FA, and Drafts all open the right panel (`38-uncovered-surfaces.js`, personal, business) | behavioral |
| `listener:#btn-ac-tab-privileged-access:click` | listener | Interaction: btn-ac-tab-privileged-access click [listener:#btn-ac-tab-privileged-access:click] | auto |
| `listener:#btn-ac-tab-security-access:click` | listener | Interaction: btn-ac-tab-security-access click [listener:#btn-ac-tab-security-access:click] | auto |
| `listener:#btn-ac-tab-spam:click` | listener | Interaction: btn-ac-tab-spam click [listener:#btn-ac-tab-spam:click] | auto |
| `listener:#btn-ac-tab-verification:click` | listener | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `listener:#btn-account-type-business:click` | listener | Interaction: btn-account-type-business click [listener:#btn-account-type-business:click] | auto |
| `listener:#btn-account-type-personal:click` | listener | Interaction: btn-account-type-personal click [listener:#btn-account-type-personal:click] | auto |
| `listener:#btn-add-highlight-header:click` | listener | Visitor profile buttons, contact links, tabs, and avatar open the expected surfaces (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-add-highlight:click` | listener | Interaction: btn-add-highlight click [listener:#btn-add-highlight:click] | auto |
| `listener:#btn-auth-back-to-splash:click` | listener | Interaction: btn-auth-back-to-splash click [listener:#btn-auth-back-to-splash:click] | auto |
| `listener:#btn-auth-return-session:click` | listener | Interaction: btn-auth-return-session click [listener:#btn-auth-return-session:click] | auto |
| `listener:#btn-back-from-user-profile:click` | listener | Interaction: btn-back-from-user-profile click [listener:#btn-back-from-user-profile:click] | auto |
| `listener:#btn-cancel-deactivate:click` | listener | Interaction: btn-cancel-deactivate click [listener:#btn-cancel-deactivate:click] | auto |
| `listener:#btn-cancel-delete-draft:click` | listener | Interaction: btn-cancel-delete-draft click [listener:#btn-cancel-delete-draft:click] | auto |
| `listener:#btn-cancel-delete:click` | listener | Interaction: btn-cancel-delete click [listener:#btn-cancel-delete:click] | auto |
| `listener:#btn-cancel-edit-profile:click` | listener | Create Post and Edit Profile close buttons, caption helper, file inputs, and Close Friends toggles work without wiping the profile (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-cancel-switch-password:click` | listener | Everything for the account switcher exists (`18-account-switcher.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `listener:#btn-cf-menu-connect:click` | listener | Item 6: Stale outbound follower edges are cleaned up (6a) and Close Friends caret includes Connect action (6b) (`29-nov23-fixes.js`, personal) | behavioral |
| `listener:#btn-cf-menu-toggle:click` | listener | Interaction: btn-cf-menu-toggle click [listener:#btn-cf-menu-toggle:click] | auto |
| `listener:#btn-close-account-center:click` | listener | Interaction: btn-close-account-center click [listener:#btn-close-account-center:click] | auto |
| `listener:#btn-close-account-switcher:click` | listener | Interaction: btn-close-account-switcher click [listener:#btn-close-account-switcher:click] | auto |
| `listener:#btn-close-create-modal:click` | listener | Create Post and Edit Profile close buttons, caption helper, file inputs, and Close Friends toggles work without wiping the profile (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-close-discover-creators-modal:click` | listener | Interaction: btn-close-discover-creators-modal click [listener:#btn-close-discover-creators-modal:click] | auto |
| `listener:#btn-close-drafts:click` | listener | Interaction: btn-close-drafts click [listener:#btn-close-drafts:click] | auto |
| `listener:#btn-close-edit-profile:click` | listener | Create Post and Edit Profile close buttons, caption helper, file inputs, and Close Friends toggles work without wiping the profile (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-close-followers-modal:click` | listener | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-close-following-modal:click` | listener | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-close-forgot-password:click` | listener | Interaction: btn-close-forgot-password click [listener:#btn-close-forgot-password:click] | auto |
| `listener:#btn-close-messages:click` | listener | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-close-note-composer:click` | listener | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-close-post-modal:click` | listener | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-close-story-comments:click` | listener | Story share, more, prev/next, and reply-enter work for owner and viewer (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-close-story-owner-menu:click` | listener | Interaction: btn-close-story-owner-menu click [listener:#btn-close-story-owner-menu:click] | auto |
| `listener:#btn-close-story-viewers:click` | listener | Interaction: btn-close-story-viewers click [listener:#btn-close-story-viewers:click] | auto |
| `listener:#btn-close-story:click` | listener | Interaction: btn-close-story click [listener:#btn-close-story:click] | auto |
| `listener:#btn-close-switch-password:click` | listener | Everything for the account switcher exists (`18-account-switcher.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `listener:#btn-confirm-deactivate:click` | listener | Interaction: btn-confirm-deactivate click [listener:#btn-confirm-deactivate:click] | auto |
| `listener:#btn-confirm-delete-draft:click` | listener | Interaction: btn-confirm-delete-draft click [listener:#btn-confirm-delete-draft:click] | auto |
| `listener:#btn-confirm-delete:click` | listener | Interaction: btn-confirm-delete click [listener:#btn-confirm-delete:click] | auto |
| `listener:#btn-confirm-switch-password:click` | listener | Everything for the account switcher exists (`18-account-switcher.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `listener:#btn-dismiss-business-info-banner:click` | listener | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `listener:#btn-edit-account-government:click` | listener | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `listener:#btn-edit-account-personal:click` | listener | Interaction: btn-edit-account-personal click [listener:#btn-edit-account-personal:click] | auto |
| `listener:#btn-edit-complete-business-info:click` | listener | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `listener:#btn-edit-profile-modal:click` | listener | Interaction: btn-edit-profile-modal click [listener:#btn-edit-profile-modal:click] | auto |
| `listener:#btn-edit-request-verification:click` | listener | Edit Profile has four category tabs and the paywall appears without Plus (`16-gov-org-verification.js`, personal, business, empty, pixlynote) | behavioral |
| `listener:#btn-forgot-back:click` | listener | Interaction: btn-forgot-back click [listener:#btn-forgot-back:click] | auto |
| `listener:#btn-forgot-password:click` | listener | Interaction: btn-forgot-password click [listener:#btn-forgot-password:click] | auto |
| `listener:#btn-header-profile:click` | listener | Everything for the account switcher exists (`18-account-switcher.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `listener:#btn-mark-all-read:click` | listener | Interaction: btn-mark-all-read click [listener:#btn-mark-all-read:click] | auto |
| `listener:#btn-menu-block:click` | listener | Interaction: btn-menu-block click [listener:#btn-menu-block:click] | auto |
| `listener:#btn-menu-info-about:click` | listener | Interaction: btn-menu-info-about click [listener:#btn-menu-info-about:click] | auto |
| `listener:#btn-menu-mute:click` | listener | Interaction: btn-menu-mute click [listener:#btn-menu-mute:click] | auto |
| `listener:#btn-modal-delete-post:click` | listener | Interaction: btn-modal-delete-post click [listener:#btn-modal-delete-post:click] | auto |
| `listener:#btn-modal-edit-post:click` | listener | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) | behavioral |
| `listener:#btn-modal-focus-comment:click` | listener | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-modal-like:click` | listener | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) +1 more | behavioral |
| `listener:#btn-modal-save:click` | listener | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) +1 more | behavioral |
| `listener:#btn-modal-share:click` | listener | Post and note menus, copy, not-interested, spam, and double-tap like work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-note-fab:click` | listener | Interaction: btn-note-fab click [listener:#btn-note-fab:click] | auto |
| `listener:#btn-open-create-modal:click` | listener | Interaction: btn-open-create-modal click [listener:#btn-open-create-modal:click] | auto |
| `listener:#btn-open-drafts-from-create:click` | listener | Interaction: btn-open-drafts-from-create click [listener:#btn-open-drafts-from-create:click] | auto |
| `listener:#btn-open-drafts-from-note:click` | listener | Create Post and Edit Profile close buttons, caption helper, file inputs, and Close Friends toggles work without wiping the profile (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-open-messages:click` | listener | Interaction: btn-open-messages click [listener:#btn-open-messages:click] | auto |
| `listener:#btn-profile-complete-business-info:click` | listener | Everything for business info and verification exists (`17-business-verification.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `listener:#btn-profile-pic:click` | listener | Interaction: btn-profile-pic click [listener:#btn-profile-pic:click] | auto |
| `listener:#btn-save-note-draft:click` | listener | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) +1 more | behavioral |
| `listener:#btn-save-post-draft:click` | listener | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) +1 more | behavioral |
| `listener:#btn-share-profile:click` | listener | Interaction: btn-share-profile click [listener:#btn-share-profile:click] | auto |
| `listener:#btn-share-user-profile:click` | listener | Visitor profile buttons, contact links, tabs, and avatar open the expected surfaces (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-shuffle-discover-creators:click` | listener | Explore refresh, Discover shuffle, header search, nav brand, and load-more all work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-signup-back-step1:click` | listener | Interaction: btn-signup-back-step1 click [listener:#btn-signup-back-step1:click] | auto |
| `listener:#btn-signup-complete:click` | listener | Interaction: btn-signup-complete click [listener:#btn-signup-complete:click] | auto |
| `listener:#btn-signup-direct-submit:click` | listener | Interaction: btn-signup-direct-submit click [listener:#btn-signup-direct-submit:click] | auto |
| `listener:#btn-signup-resend-email-code:click` | listener | Interaction: btn-signup-resend-email-code click [listener:#btn-signup-resend-email-code:click] | auto |
| `listener:#btn-signup-resend-phone-code:click` | listener | Interaction: btn-signup-resend-phone-code click [listener:#btn-signup-resend-phone-code:click] | auto |
| `listener:#btn-signup-send-email-code:click` | listener | Interaction: btn-signup-send-email-code click [listener:#btn-signup-send-email-code:click] | auto |
| `listener:#btn-signup-send-phone-code:click` | listener | Interaction: btn-signup-send-phone-code click [listener:#btn-signup-send-phone-code:click] | auto |
| `listener:#btn-signup-to-step2:click` | listener | Interaction: btn-signup-to-step2 click [listener:#btn-signup-to-step2:click] | auto |
| `listener:#btn-signup-verify-email-code:click` | listener | Interaction: btn-signup-verify-email-code click [listener:#btn-signup-verify-email-code:click] | auto |
| `listener:#btn-signup-verify-phone-code:click` | listener | Interaction: btn-signup-verify-phone-code click [listener:#btn-signup-verify-phone-code:click] | auto |
| `listener:#btn-splash-get-started:click` | listener | Interaction: btn-splash-get-started click [listener:#btn-splash-get-started:click] | auto |
| `listener:#btn-splash-login:click` | listener | Interaction: btn-splash-login click [listener:#btn-splash-login:click] | auto |
| `listener:#btn-story-delete:click` | listener | Interaction: btn-story-delete click [listener:#btn-story-delete:click] | auto |
| `listener:#btn-story-owner-comments:click` | listener | Story share, more, prev/next, and reply-enter work for owner and viewer (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-story-owner-more:click` | listener | Interaction: btn-story-owner-more click [listener:#btn-story-owner-more:click] | auto |
| `listener:#btn-story-owner-share:click` | listener | Story share, more, prev/next, and reply-enter work for owner and viewer (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-story-save-photo:click` | listener | Story share, more, prev/next, and reply-enter work for owner and viewer (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-story-send-heart:click` | listener | Interaction: btn-story-send-heart click [listener:#btn-story-send-heart:click] | auto |
| `listener:#btn-story-send-reply:click` | listener | Story share, more, prev/next, and reply-enter work for owner and viewer (`38-uncovered-surfaces.js`, personal) +1 more | behavioral |
| `listener:#btn-story-share-to-feed:click` | listener | Story share, more, prev/next, and reply-enter work for owner and viewer (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-story-viewer-comments:click` | listener | Story share, more, prev/next, and reply-enter work for owner and viewer (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-story-viewer-more:click` | listener | Story share, more, prev/next, and reply-enter work for owner and viewer (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-story-viewer-share:click` | listener | Story share, more, prev/next, and reply-enter work for owner and viewer (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-story-viewers:click` | listener | Interaction: btn-story-viewers click [listener:#btn-story-viewers:click] | auto |
| `listener:#btn-submit-post:click` | listener | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) | behavioral |
| `listener:#btn-submit-story:click` | listener | Interaction: btn-submit-story click [listener:#btn-submit-story:click] | auto |
| `listener:#btn-switcher-login:click` | listener | Interaction: btn-switcher-login click [listener:#btn-switcher-login:click] | auto |
| `listener:#btn-switcher-signup:click` | listener | Interaction: btn-switcher-signup click [listener:#btn-switcher-signup:click] | auto |
| `listener:#btn-toggle-auth-mode:click` | listener | Interaction: btn-toggle-auth-mode click [listener:#btn-toggle-auth-mode:click] | auto |
| `listener:#btn-toggle-notifications:click` | listener | Interaction: btn-toggle-notifications click [listener:#btn-toggle-notifications:click] | auto |
| `listener:#btn-toggle-signup-password:click` | listener | Interaction: btn-toggle-signup-password click [listener:#btn-toggle-signup-password:click] | auto |
| `listener:#btn-user-profile-cf-caret:click` | listener | Visitor profile buttons, contact links, tabs, and avatar open the expected surfaces (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-user-profile-follow:click` | listener | Interaction: btn-user-profile-follow click [listener:#btn-user-profile-follow:click] | auto |
| `listener:#btn-user-profile-message:click` | listener | Visitor profile buttons, contact links, tabs, and avatar open the expected surfaces (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#btn-user-profile-more:click` | listener | Visitor profile buttons, contact links, tabs, and avatar open the expected surfaces (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#create-post-form:submit` | listener | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) +1 more | behavioral |
| `listener:#discover-creators-search-input:input` | listener | Discover Creators shows only unconnected users, including in search (`09-discover.js`, personal, business, empty, pixlynote) | behavioral |
| `listener:#drafts-list:click` | listener | Account Center Login and Sign up, Drafts list, and Likes/Saved panels respond to clicks without wiping profile data (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#edit-profile-avatar-file:change` | listener | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) | behavioral |
| `listener:#edit-profile-form:submit` | listener | Interaction: edit-profile-form submit [listener:#edit-profile-form:submit] | auto |
| `listener:#explore-grid:click` | listener | Explore refresh, Discover shuffle, header search, nav brand, and load-more all work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#explore-search-input:input` | listener | Interaction: explore-search-input input [listener:#explore-search-input:input] | auto |
| `listener:#followers-search-input:input` | listener | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#following-search-input:input` | listener | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#form-ac-change-password:submit` | listener | Interaction: form-ac-change-password submit [listener:#form-ac-change-password:submit] | auto |
| `listener:#header-search-input:keydown` | listener | Explore refresh, Discover shuffle, header search, nav brand, and load-more all work (`38-uncovered-surfaces.js`, personal) +1 more | behavioral |
| `listener:#login-email:input` | listener | Interaction: login-email input [listener:#login-email:input] | auto |
| `listener:#login-fullname:input` | listener | Interaction: login-fullname input [listener:#login-fullname:input] | auto |
| `listener:#menu-disconnect-confirm:click` | listener | Interaction: menu-disconnect-confirm click [listener:#menu-disconnect-confirm:click] | auto |
| `listener:#menu-disconnect-confirm:keydown` | listener | Interaction: menu-disconnect-confirm keydown [listener:#menu-disconnect-confirm:keydown] | auto |
| `listener:#modal-account-center:click` | listener | Interaction: modal-account-center click [listener:#modal-account-center:click] | auto |
| `listener:#modal-account-switcher:click` | listener | Interaction: modal-account-switcher click [listener:#modal-account-switcher:click] | auto |
| `listener:#modal-cancel-membership:click` | listener | Interaction: modal-cancel-membership click [listener:#modal-cancel-membership:click] | auto |
| `listener:#modal-comment-input:submit` | listener | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) | behavioral |
| `listener:#modal-delete-confirm:click` | listener | Interaction: modal-delete-confirm click [listener:#modal-delete-confirm:click] | auto |
| `listener:#modal-discover-creators:click` | listener | Interaction: modal-discover-creators click [listener:#modal-discover-creators:click] | auto |
| `listener:#modal-followers:click` | listener | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#modal-following:click` | listener | Interaction: modal-following click [listener:#modal-following:click] | auto |
| `listener:#modal-post-detail:click` | listener | Post and note menus, copy, not-interested, spam, and double-tap like work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#modal-post-img:dblclick` | listener | Post and note menus, copy, not-interested, spam, and double-tap like work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#nav-brand-btn:click` | listener | Explore refresh, Discover shuffle, header search, nav brand, and load-more all work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#nav-btn-create:click` | listener | Explore refresh, Discover shuffle, header search, nav brand, and load-more all work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#nav-btn-explore:click` | listener | Explore refresh, Discover shuffle, header search, nav brand, and load-more all work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#nav-btn-feed:click` | listener | Explore refresh, Discover shuffle, header search, nav brand, and load-more all work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#nav-btn-profile:click` | listener | Explore refresh, Discover shuffle, header search, nav brand, and load-more all work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#note-compose-form:submit` | listener | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) | behavioral |
| `listener:#note-composer-sheet-backdrop:click` | listener | Create Post and Edit Profile close buttons, caption helper, file inputs, and Close Friends toggles work without wiping the profile (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#profile-avatar-container:click` | listener | Interaction: profile-avatar-container click [listener:#profile-avatar-container:click] | auto |
| `listener:#profile-avatar-direct-upload:change` | listener | Write-path interactions never blank profile, membership, posts, or connections across Personal, Plus, Government, Business, Business Plus, and Organization (`37-write-guards.js`, personal, business) | behavioral |
| `listener:#profile-following-count:click` | listener | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#profile-likes-container:click` | listener | Account Center Login and Sign up, Drafts list, and Likes/Saved panels respond to clicks without wiping profile data (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#profile-saved-photos-panel:click` | listener | Account Center Login and Sign up, Drafts list, and Likes/Saved panels respond to clicks without wiping profile data (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#signup-avatar-file-input:change` | listener | Signed-out auth interactions do not wipe a previously stored account phone or email (`37-write-guards.js`, signed-out) | behavioral |
| `listener:#signup-email-code:keydown` | listener | Signed-out auth interactions do not wipe a previously stored account phone or email (`37-write-guards.js`, signed-out) | behavioral |
| `listener:#signup-password:input` | listener | Signed-out auth interactions do not wipe a previously stored account phone or email (`37-write-guards.js`, signed-out) | behavioral |
| `listener:#signup-phone-code:keydown` | listener | Signed-out auth interactions do not wipe a previously stored account phone or email (`37-write-guards.js`, signed-out) | behavioral |
| `listener:#signup-phone:input` | listener | Signed-out auth interactions do not wipe a previously stored account phone or email (`37-write-guards.js`, signed-out) | behavioral |
| `listener:#signup-username:input` | listener | Signed-out auth interactions do not wipe a previously stored account phone or email (`37-write-guards.js`, signed-out) | behavioral |
| `listener:#stat-followers-btn:click` | listener | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#stat-following-btn:click` | listener | Post, note, messages, followers, and following close buttons and comment focus work (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#story-reply-input:focus` | listener | Story share, more, prev/next, and reply-enter work for owner and viewer (`38-uncovered-surfaces.js`, personal) +1 more | behavioral |
| `listener:#switch-password-input:keydown` | listener | Everything for the account switcher exists (`18-account-switcher.js`, personal, business, empty, pixlynote) +1 more | behavioral |
| `listener:#tab-auth-login:click` | listener | Signed-out auth interactions do not wipe a previously stored account phone or email (`37-write-guards.js`, signed-out) | behavioral |
| `listener:#tab-auth-signup:click` | listener | Signed-out auth interactions do not wipe a previously stored account phone or email (`37-write-guards.js`, signed-out) | behavioral |
| `listener:#user-tab-btn-info:click` | listener | Visitor profile buttons, contact links, tabs, and avatar open the expected surfaces (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#user-tab-btn-notes:click` | listener | Visitor profile buttons, contact links, tabs, and avatar open the expected surfaces (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#user-tab-btn-posts:click` | listener | Visitor profile buttons, contact links, tabs, and avatar open the expected surfaces (`38-uncovered-surfaces.js`, personal) | behavioral |
| `listener:#user-tab-btn-replies:click` | listener | Visitor profile buttons, contact links, tabs, and avatar open the expected surfaces (`38-uncovered-surfaces.js`, personal) | behavioral |
| `nav:auth:login` | nav | Login: empty credentials are rejected (`02-login.js`, signed-out) | behavioral |
| `nav:auth:signup` | nav | Sign-up: email and/or phone is required before continuing (`01-signup.js`, signed-out) | behavioral |
| `nav:explore:notes` | nav | E2E Notes & Explore: create note, search Explore Posts & Notes, open Discover Creators (`22-e2e-feed-explore-posts-notes.js`, personal) | behavioral |
| `nav:explore:posts` | nav | E2E Notes & Explore: create note, search Explore Posts & Notes, open Discover Creators (`22-e2e-feed-explore-posts-notes.js`, personal) | behavioral |
| `nav:gesture:pull-to-refresh` | nav | Pull down at the top of the feed triggers refresh and does not wipe profile data (`39-gestures-shortcuts.js`, personal) | behavioral |
| `nav:main:create` | nav | Notifications, DMs and stories UI open (`13-notifications-dms-stories.js`, personal, business, empty, pixlynote) | behavioral |
| `nav:main:explore` | nav | Feed, Explore and expanded post/reply detail all have the sparkle AI and share buttons (`08-sparkle-share.js`, personal, business, empty, pixlynote) | behavioral |
| `nav:main:feed` | nav | Feed, Explore and expanded post/reply detail all have the sparkle AI and share buttons (`08-sparkle-share.js`, personal, business, empty, pixlynote) | behavioral |
| `nav:main:pixai` | nav | Feed, Explore and expanded post/reply detail all have the sparkle AI and share buttons (`08-sparkle-share.js`, personal, business, empty, pixlynote) | behavioral |
| `nav:main:profile` | nav | Owner tab row: Posts, Notes, Replies, Saved and Likes with count badges, at 390px and 360px (`05-owner-tabs.js`, personal, business, empty, pixlynote) | behavioral |
| `nav:profile:likes` | nav | Owner tab row: Posts, Notes, Replies, Saved and Likes with count badges, at 390px and 360px (`05-owner-tabs.js`, personal, business, empty, pixlynote) | behavioral |
| `nav:profile:likes-notes` | nav | Liked and Saved show real Explore items, hide seed ids 1–6, and sort Saved newest first (`06-likes-saves.js`, personal, business, empty, pixlynote) | behavioral |
| `nav:profile:likes-photos` | nav | Liked and Saved show real Explore items, hide seed ids 1–6, and sort Saved newest first (`06-likes-saves.js`, personal, business, empty, pixlynote) | behavioral |
| `nav:profile:notes` | nav | Owner tab row: Posts, Notes, Replies, Saved and Likes with count badges, at 390px and 360px (`05-owner-tabs.js`, personal, business, empty, pixlynote) | behavioral |
| `nav:profile:posts` | nav | Owner tab row: Posts, Notes, Replies, Saved and Likes with count badges, at 390px and 360px (`05-owner-tabs.js`, personal, business, empty, pixlynote) | behavioral |
| `nav:profile:replies` | nav | Owner tab row: Posts, Notes, Replies, Saved and Likes with count badges, at 390px and 360px (`05-owner-tabs.js`, personal, business, empty, pixlynote) | behavioral |
| `nav:profile:saved` | nav | Owner tab row: Posts, Notes, Replies, Saved and Likes with count badges, at 390px and 360px (`05-owner-tabs.js`, personal, business, empty, pixlynote) | behavioral |
| `nav:profile:saved-notes` | nav | Liked and Saved show real Explore items, hide seed ids 1–6, and sort Saved newest first (`06-likes-saves.js`, personal, business, empty, pixlynote) | behavioral |
| `nav:profile:saved-photos` | nav | Liked and Saved show real Explore items, hide seed ids 1–6, and sort Saved newest first (`06-likes-saves.js`, personal, business, empty, pixlynote) | behavioral |
| `nav:shortcut:escape-closes-menus` | nav | Escape closes the feedback modal and the disconnect confirmation (`39-gestures-shortcuts.js`, personal) | behavioral |
| `nav:shortcut:header-search-enter` | nav | Explore refresh, Discover shuffle, header search, nav brand, and load-more all work (`38-uncovered-surfaces.js`, personal) +1 more | behavioral |
| `nav:shortcut:signup-email-code-enter` | nav | Signed-out auth interactions do not wipe a previously stored account phone or email (`37-write-guards.js`, signed-out) | behavioral |
| `nav:shortcut:signup-phone-code-enter` | nav | Signed-out auth interactions do not wipe a previously stored account phone or email (`37-write-guards.js`, signed-out) | behavioral |
| `nav:shortcut:story-reply-enter` | nav | Story share, more, prev/next, and reply-enter work for owner and viewer (`38-uncovered-surfaces.js`, personal) +1 more | behavioral |
| `nav:user-profile:notes` | nav | Visitor tab row: non-owners do not see Saved or Likes (`05-owner-tabs.js`, personal, business, empty, pixlynote) | behavioral |
| `nav:user-profile:posts` | nav | Visitor tab row: non-owners do not see Saved or Likes (`05-owner-tabs.js`, personal, business, empty, pixlynote) | behavioral |
| `nav:user-profile:replies` | nav | Visitor tab row: non-owners do not see Saved or Likes (`05-owner-tabs.js`, personal, business, empty, pixlynote) | behavioral |
