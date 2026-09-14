# Folder and Dataview sources

Both providers suggest existing files. Finding a file by an alias links to that
file; it does not create or rename a note. Template creation recipes are separate
and remain available if the ordinary source or its filters are invalid.

## Choose files

Folder includes immediate child files by default. **Load entities from
sub-folders** includes all descendants of that actual folder, without including
similarly named sibling folders. An empty path selects the vault root. Spaces in
paths are literal. All file types remain eligible, including attachments.

Dataview accepts the source expression used by `pages(source)`, for example
`#person` or `"People"`. An empty or whitespace-only source selects all indexed
pages. This field is not a full `TABLE`, `LIST`, or JavaScript query. Dataview must
be available; its page results must resolve to real files in the vault.

Source feedback distinguishes missing/unavailable sources, invalid sources,
valid empty sources, and qualifying file counts. Counts are real files after
filtering, out of the files selected by the source; aliases do not inflate them.
Folder counts follow the recursion toggle. Metadata and integration changes
refresh subsequent lookups through the existing provider cache lifecycle.
Reopening settings or editing the source reevaluates its displayed status;
settings do not poll an optional plugin in the background.

## Find files by aliases

**Suggest native aliases** follows Obsidian's public alias parser. Folder defaults
to on, Dataview to off. An explicit saved off setting is now honored. Existing
configurations with that setting off will stop offering native aliases until it
is enabled. Every qualifying file retains its base entry.

**Frontmatter alias property** optionally names one exact, case-sensitive, own
frontmatter key. For example, set it to `ldap` to find `Bob Hope.md` with:

```yaml
ldap: hopeb@
```

Typing `@hop` can offer `hopeb@`; selecting it links to Bob Hope with that display
text. This works with native aliases off. The same alias on different files stays
selectable; duplicate aliases for the same file are deduplicated by the suggestor.

Custom aliases accept text or a flat list of text values. Outer whitespace and
blank entries are removed; valid text alongside non-text entries is retained.
Punctuation, case, interior whitespace and comma-containing text are preserved.
Quote numeric identifiers in YAML if they should be aliases. Dots in a property
name are literal; nested, inline and computed Dataview fields are not interpreted.
An empty selector turns custom aliases off. Unsupported legacy selector values
remain preserved and diagnosed until explicitly replaced; base/native entries
remain available.

## Filter files

All active rows must pass, before aliases are expanded. Patterns are
case-insensitive JavaScript regular expressions. Include passes if **any**
supported property value matches; exclude passes if **none** match.

Strings (including empty strings), booleans and finite numbers are supported.
A flat list tests each supported member independently. False and zero are real
values. Missing/null properties, absent frontmatter, objects and nested lists
supply no values: include fails, exclude passes. Only exact own frontmatter keys
are read; lists are never joined into comma-separated text.

An empty property or pattern leaves a row **inactive**. Use `.*` to match any
present supported value, or `^$` for an explicit empty string. Pattern whitespace
is significant. An active invalid regex blocks that provider's ordinary file
suggestions and shows an error, while other configured providers remain usable.

Edits retain exact source/path/pattern text even when it is invalid or Dataview is
unavailable. Validation describes current behavior; the existing settings save
status reports failed disk writes and provides retry. If settings views edit
the same filter list, a conflict preserves the newer configuration. Reopen the
provider to edit it. Malformed imported filter data opens protected recovery
mode until repaired. The unimplemented current-note-property matching control
has been removed; its stored legacy values remain untouched.
