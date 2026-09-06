# Roadmap

paperwright is templates that are data: a JSON document model, bindings into the host's data,
and a renderer that produces the same PDF every time. Everything below is in service of that.
Items arrive when a template needs them, not before; the four example templates (invoice,
letter, payslip, certificate) are the specification, and each new capability lands with a
template that uses it and a golden test that pins its output.

## Where we are: 0.1

- `@paperwright/model`: types, Zod schema, `{{ var | filter }}` bindings with Intl-backed
  filters, the resolver (repeat, if, dataTable, columns), warnings instead of throws, a
  version field with the migration machinery in place.
- `@paperwright/pdf`: Forme engine behind a `DocumentEngine` seam, the component layer
  vendored from pdfcn's Forme base, two themes plus per-render theme objects and overrides,
  fixed header and footer bands, page numbers, repeating table headers, bundled Inter.
- Golden tests: the text layer of every example, read back through pdf.js.

**Schema stability.** Nothing is published yet, so the schema could still change in place.
From the first npm release the schema is frozen: a removed or renamed field becomes a migration
step under `version`, never a silent cut. The empty migration list is the seat for that.

## Next: the builder (0.2)

A drag-and-drop editor over the model. The model is the source of truth and the builder is a
view of it; nothing the builder can express is outside the schema.

- Spike Puck as the canvas (two weeks), dnd-kit as the fallback.
- Variable picker fed by `listBindings(model)` and a data sample from the host.
- Live preview: render in a worker with Forme's browser build and show pages with pdf.js.
- Template gallery: convert pdfcn's ten invoice and report designs into JSON templates, which is
  also where "starter templates" for a marketplace come from.
- First consumer cutover: the certificate above replaces PRISM's LMS certificate, then the
  letters, then the ad-hoc exports; Carbone and its Studio proxy go.

## AI: prompt to template, and everything around it

The model is a strict, small schema, which is what makes this tractable. The plan is
provider-neutral: an interface the host implements with its own model and keys.

- **Prompt to template.** `z.toJSONSchema(documentModelSchema)` is the structured-output contract.
  The model emits a template, `validateModel` checks it, and the issues (with paths) go back for
  a repair round; two rounds cover almost everything. Output is always a template the builder can
  open, never a one-off PDF.
- **Sample data for the preview.** From `listBindings` plus the prompt, synthesise a data object
  so a generated template renders immediately, and the host can replace it with real data.
- **Edit by instruction.** In the builder, "move the totals under the table and make the invoice
  number red" becomes a diff of blocks, applied through the same validation.
- **Binding suggestions.** Match a template's bindings against the keys of a data sample (exact,
  then fuzzy) to wire up a template pasted from elsewhere, or to flag bindings the data will
  never satisfy before a render is attempted.
- **Draft from a document.** Upload a PDF or Word file, extract text and coarse layout, and draft
  a template with the values replaced by bindings and a confirmation screen for the guesses. This
  is the honest version of "Word import" and it shares the importer with the DOCX work below.
- **Layout critique.** Render, rasterise, and let a vision model (or plain heuristics on the text
  layer: orphans, overflow, a table header alone at a page foot) report what a person would
  notice. The same loop that found the column-width and spacing defects in 0.1, automated.

## Output: fidelity and reach

- **Fonts**: register custom faces per tenant; font subsetting is engine-side already.
- **Bidirectional text and non-Latin scripts** (Forme supports bidi); Noto fallbacks for scripts
  Inter does not cover.
- **Blocks that templates keep asking for**: charts (Forme has bar, line, pie, area), barcodes,
  table footers and column spans, a spacer, per-block colour and size overrides.
- **Fillable PDFs**: Forme's text field, checkbox and dropdown primitives as blocks, for forms
  that are completed after printing.
- **DOCX as an editable export (0.3)**: rendered from the same model with `docx`, twice rather
  than converted, for the letters HR wants to finish in Word.
- **Word import (0.4)**: the draft importer above, with headers and footers read from the OOXML.
- **Browser rendering**: Forme's browser and worker builds; the bundled fonts move behind a
  Node-only entry so the main entry loads in a worker.

## Security and metadata hardening

PDFs leave the building, get archived, and get verified years later. The renderer has to make
that safe by default.

- **Deterministic output.** A fixed `creationDate` and no other timestamps, so the same template
  and data give byte-identical bytes, goldens can compare bytes rather than text, and a document
  can be re-rendered to prove what was issued.
- **Metadata.** Title, author, subject, language and creation date set from the model and the
  host, with a custom XMP schema carrying template id and version plus a hash of the data, so a
  document records its own provenance.
- **Archival and accessibility.** PDF/A-2b for archives and PDF/A-3b where a file is embedded;
  tagged output with `lang`, and `alt` on image blocks so PDF/UA is reachable.
- **Certification.** X.509 signing through Forme's `certifyPdf`, with reason, location and an
  optional visible stamp; the certificate stays with the host.
- **E-signature manifest.** A signature block reports its page and rectangle from the layout
  pass, so a host can hand an e-sign service exact field positions without any e-sign semantics
  living in the model.
- **Encryption and permissions.** Owner and user passwords, print and copy restrictions. Forme
  does not encrypt, so this is a post-processing step with a maintained library, chosen when the
  work starts.
- **Redaction.** Forme's text and region redaction for data-subject exports and disclosures.
- **Embedded files.** Factur-X and ZUGFeRD e-invoices: the invoice XML attached and declared, so
  the invoice template produces a machine-readable invoice.
- **Verification.** The certificate's QR code points at the host's verify endpoint; the renderer
  can put a content hash in the metadata and the QR payload so the two can be matched.
- **Input hardening.** Sniff image bytes rather than trusting the declared mime type; SVG off
  unless enabled; limits on template size, binding depth and expression length; render in a
  worker with a time and memory budget; no network access during a render, ever (assets arrive
  as bytes).

## Operations

- A CLI: `paperwright render template.json data.json --out file.pdf`, and `validate`.
- A reference HTTP service with a render queue, for hosts that would rather not run WASM
  in-process.
- Benchmarks and a compiled-tree cache for high-volume runs such as month-end payslips.
- Publishing: the two packages to npm under `@paperwright`, with the schema freeze above.

## Not planned

- A second engine. The seam exists; an implementation returns when a document needs something
  Forme cannot do.
- A general-purpose React PDF component library. The components exist to serve the compiler;
  they come back from pdfcn as blocks need them.
- A marketplace of React blocks. Templates are JSON; that is what a marketplace would trade.
