# Contributing

paperwright is a document model that renders to PDF, a composer over it, and an AI package that
drafts templates. This page is what you need to know before opening a pull request.

## Set up

Node 22 and pnpm 11.

```bash
pnpm install
pnpm build        # the packages, in dependency order; apps and tests import each package's dist
pnpm test         # build, then vitest across packages and apps
pnpm typecheck    # every package and app
pnpm composer     # the composer at http://localhost:5181
pnpm playground   # the JSON playground at http://localhost:5180
```

Rebuild after editing a package. Cross-package imports resolve to `dist`, so a stale build shows
up as a test or type failure that has nothing to do with your change.

## What "supported" means

A capability is supported when an example template uses it and a golden test pins its output.
`examples/basic/templates` is the specification; `packages/pdf/test/render.test.ts` reads the
rendered text back through pdf.js and compares it with the snapshot under `__snapshots__`. A
type in the schema, or a primitive registered in the renderer, is not a supported feature on its
own.

So a new capability lands as one change: the model, the renderer, the composer, an example that
uses it, and the golden test. Half of that is a draft, not a feature.

## The schema is stored data

Templates live in hosts' databases. Until the first npm release the schema can still change in
place; from that release on, a removed or renamed field becomes a migration step under `version`
in `packages/model/src/migrations.ts`, never a silent cut. If your change alters `DocumentModel`
or a block, say so in the pull request, and include the migration when one is needed.

## Adding a block

1. `packages/model/src/types.ts` and `schema.ts`: the type and its Zod schema. `resolve.ts` if
   the block binds data; `migrations.ts` if it changes an existing shape.
2. `packages/pdf/src/render/compile.tsx`: the block compiles to the component layer under
   `packages/pdf/src/components`.
3. `apps/composer/src/config.tsx` and `transform.ts`: a palette entry, its fields, a canvas
   preview, and the mapping to and from Puck's data. Never name a slot `then`; Puck would treat
   the props as a promise.
4. `packages/ai/src/guide.ts`: a sentence on when the block is the right choice, if the schema
   does not make it obvious.
5. An example under `examples/basic` that uses it, and the golden test.

## Reporting a defect

An issue with the template JSON, the data, and what you expected is the fastest path. A failing
test in the right package is faster still.

## Pull requests

- One change per pull request, with the reason in the description.
- `pnpm test` and `pnpm typecheck` are the gate; run both before pushing.
- Comments explain why, never what the code does, and never narrate a change.
- Prefer changing callers over keeping two code paths. The stored schema, above, is the one
  exception.
- Prefer a maintained library to a custom implementation for anything that is not the product.

## Code adapted from elsewhere

Parts of `packages/pdf/src` are adapted from [pdfcn](https://github.com/shadcn-labs/pdfcn)
(MIT). A derived file carries a line at the top naming its source, and the licence text lives
in `NOTICE`. Do the same for anything you adapt: the line on the file, the entry in `NOTICE`,
and a licence compatible with MIT.

## Licence

By contributing you agree that your contribution is licensed under the MIT licence in `LICENSE`.
