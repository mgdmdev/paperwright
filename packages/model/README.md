# @paperwright/model

The paperwright document model. A template is data: this package defines its shape, validates it,
resolves bindings against your data, and migrates older versions forward. It has no React and no
rendering engine, so it runs anywhere: a server, a browser, a worker.

## The model

```jsonc
{
  "version": 1,
  "id": "invoice",
  "name": "Invoice",
  "locale": "en-GB",
  "theme": "professional",
  "page": { "size": "A4", "orientation": "portrait", "margins": { "top": 64, "right": 48, "bottom": 64, "left": 48 } },
  "assets": [{ "hash": "72480c0b68060af1", "mime": "image/png" }],
  "header": [{ "id": "logo", "type": "image", "assetHash": "72480c0b68060af1", "width": 72, "height": 24 }],
  "footer": [{ "id": "pn", "type": "pageNumber", "format": "Page {page} of {total}", "align": "center" }],
  "blocks": [
    { "id": "title", "type": "heading", "level": 1, "text": "Invoice {{ invoice.number }}" },
    { "id": "lines", "type": "dataTable", "rowBinding": "invoice.lines", "columns": [
      { "key": "d", "header": "Description", "cell": "{{ description }}" },
      { "key": "a", "header": "Amount", "cell": "{{ amount | currency:GHS }}", "align": "right", "width": 0.2 }
    ] }
  ]
}
```

Units are PDF points. Block types: `heading`, `text` (rich spans), `divider`, `image`, `qrcode`,
`keyValue`, `list`, `table`, `dataTable`, `section`, `repeat`, `if`, `keepTogether`, `signature`
(a signing line, with a stored signature image above it when `assetHash` is set), `watermark`,
`pageNumber`. Assets travel by content hash; the bytes are supplied at render time.

## Bindings

Any text field takes a literal string with `{{ }}` interpolations, or a binding object.

```
{{ employee.name | upper }}
{{ invoice.issuedOn | date:long }}
{{ amount | currency:GHS }}
{{ items | join:", " }}
{{ po | default:"none" }}
```

Filters: `date` (`short|medium|long|full|iso|time|datetime|month`), `number` (`min[,max]` fraction
digits), `currency` (`code[,display]`), `upper`, `lower`, `default`, `join`. Formatting goes through
`Intl` with the template's locale, or the locale passed at render time. Inside a `repeat`, the loop
variable is whatever `as` names; inside a `dataTable`, each row's fields are in scope directly.
`$index`, `$number` (1-based) and `$root` are always available.

## API

```ts
import { migrateModel, validateModel, resolveDocument, listBindings } from '@paperwright/model';

const model = migrateModel(json);            // checks the version and validates; throws ModelError
const result = validateModel(json);          // { ok: true, model } | { ok: false, issues }
const resolved = resolveDocument({ model, data, locale: 'fr-FR' }); // bindings → strings, repeat/if expanded
listBindings(model);                         // every path the template reads, for a variable picker
```

`resolveDocument` never throws on missing data: the field renders empty and a warning is returned.
