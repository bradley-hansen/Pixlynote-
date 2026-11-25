# Likes: one like per person

A like is a member of a set of likers. Every count on screen is computed from that set:

    count = built-in demo starting number (demo content only) + other people who liked it + my own like

Nothing adds or subtracts 1 from a stored counter, so rapid taps, two tabs, reloads and account switches cannot
double-count or go below zero.

| Surface | Where the set lives | Write |
| --- | --- | --- |
| Posts | each person's `users/{me}.likedPostIds`, plus `posts/{id}.likedBy` when the post has a cloud doc | `arrayUnion` / `arrayRemove` |
| Notes | each person's `users/{me}.likedNoteIds` (notes live in the author's owner-only `content/profile`) | `arrayUnion` / `arrayRemove` |
| Story likes | `users/{owner}.storyLikes[storyId]` and my `users/{me}.likedStoryIds` | `arrayUnion` / `arrayRemove` |
| Comments, replies | the `likedBy` list on the comment, counted as unique names | local list, one add or remove of me |
| Explore, Likes tab, modals | same helpers (`likeCountFor`, `postLikeCount`, `noteLikeCount`) | n/a |

Code: the "Like engine" block in `index.html` (`likeCountFor`, `queueLikeWrite`, `refreshAllLikeCounts`).
Writes for one item are sent one at a time and the last tap wins, so the stored set always matches the screen.
The shared full sync (`syncAllLikesToFirestore`) no longer writes like arrays, so a stale tab cannot undo a like.

Tests: `tests/suites/52-like-once.js` (app) and `tests/rules/like-once.test.js` (rules).
