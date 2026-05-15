<!--
  KingdomOS PR template — fill in what's relevant, delete what isn't.
-->

## What changed

<!-- One short paragraph. Why this exists, not just what it does. -->

## Type

- [ ] Bug fix
- [ ] New feature / content
- [ ] Refactor (no behavior change)
- [ ] Docs only
- [ ] Build / CI / tooling
- [ ] Other:

## Checklist

- [ ] `npm test` passes locally
- [ ] `npm run typecheck` passes locally
- [ ] `npm run build` succeeds
- [ ] If sim-side: added at least one test covering the new behavior
- [ ] If new content (quest arc, decision, holiday, etc.): updated content counts in `CLAUDE.md`
- [ ] If a new system: added it to the architectural map in `CLAUDE.md`
- [ ] If breaking the save schema: added a migration in `Persistence.migrateSave` with a test
- [ ] If a new public-facing feature: updated `README.md`

## Screenshots / GIFs

<!-- If anything visual changed. Photo Mode captures (P key) are great for this. -->

## How to test

<!-- Reviewer-facing: the minimal sequence of clicks/commands that proves this works. -->

1.
2.
3.

## Anything reviewers should poke at?

<!-- Edge cases you're unsure about, places you cut corners, things deferred to a follow-up. -->
