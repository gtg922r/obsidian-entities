# Date suggestions

The Date provider requires Natural Language Dates. With a compatible Periodic
Notes calendar-set integration, it uses the active calendar's daily or weekly
format and folder. Core Daily Notes can supply the daily destination when no
Periodic calendar is active for that granularity. Existing notes are real file
targets with the user's phrase as their alias, whether **Create non-existent dates** is on or off. With creation
off, a missing note becomes an unresolved link to that configured destination.
A lookup-only integration can still resolve existing notes and missing links.

Explicit weeks accept `W1`, `wk 01`, `week 1`, `2026-W01`, `26 W01` and equivalent
case variations. Only outer whitespace is ignored; the optional separators are
one dash or whitespace before the marker and one whitespace after it. Two-digit
years mean 20xx. A yearless week uses the current ISO week-year, advancing one
year when the requested week is more than four weeks earlier than the current
ISO week. The result must be a valid ISO Monday: `2020-W53` is valid;
`2021-W53`, `W00`, incomplete forms and trailing fragments are not reinterpreted
by Natural Language Dates. Disabling week suggestions also suppresses explicit
week input. Relative phrases such as `in 1 week`, `1 week ago` and
`next week 2pm` remain Natural Language Dates queries with either week setting.

Natural phrases keep their interpreted dates. In particular, “this week” keeps
the selected day for a configured locale-week format; it is not forced to ISO
Monday. On Sunday May 17, 2026, an English locale-week format identifies W21
while the ISO week is W20. Explicit ISO input always starts on ISO Monday, then
uses the configured format for its destination.

Periodic calendar lookup first checks the exact configured `.md` path, including
while the native cache is loading. If that file is missing, it checks native mappings using a date
parsed back from the configured name. This keeps ISO and locale weeks aligned
with the native filename resolver and preserves frontmatter mappings to names
such as `Log20.md`. Creation still receives the original semantic date for its
template. A folder or other nonfile occupying the configured file path is a
conflict. If the formatted name cannot be parsed back without changing it, only
an exact existing file can be used; missing-note suggestions and creation are
unavailable for that format.
The settings status warns when today's configured name cannot be parsed back.
This does not disable exact existing files or validate every possible query date.

An active valid Periodic calendar takes priority over Core Daily Notes. Core
daily fallback is available when Periodic Notes is absent, its recognized beta
daily calendar is inactive, or its complete older flat configuration has daily
notes disabled. In that complete flat shape, omitted `enabled` is the native
disabled default. Active flat configurations remain unsupported.

Without an enabled destination, the provider keeps its Natural Language Dates
daily / ISO weekly unresolved-link fallback. Core has no weekly route.
An unknown or malformed active calendar is unavailable, shown in the provider's
settings status. It does not silently route to another folder or integration.
An unavailable weekly route does not prevent valid daily routes from working.

Core daily lookup uses its trimmed formatted title and configured live folder.
Literal folder spaces are preserved. An empty Core folder uses Obsidian's public
default new-file parent with an empty source path, including the current default
folder preference; it does not use the note containing the suggestion. Missing
configured folders make the route unavailable.

Core's native lookup and creation can disagree when a trimmed title is blank,
is `/`, ends in `.md` (ignoring case), or changes under Obsidian's path normalization.
For these formats, Entities still accepts confirmed existing files at the native
lookup path, but suppresses missing-note links/actions and refuses creation.
It does not reinterpret a different existing path as the intended note. Correct
the **Daily Notes** date format to use a nonblank title without a `.md` suffix
or characters/separators that path normalization changes. Ordinary literal titles,
outer title whitespace and nested formats such as `YYYY/MM/DD` are supported.
The settings warning checks the current title only, not every possible date or
filesystem path.

Core discovery first checks the exact path, then asks the public metadata
resolver for the full vault-relative path including `.md`. Only a live file
whose entire path matches ignoring case is accepted. Basename, suffix and
other-folder matches are rejected. Discovery never calls Core's creator or
scans the full vault for a case-insensitive match.

While metadata is loading, a case-only existing file can temporarily appear as
a configured unresolved link or creation action. Normal metadata refresh updates
discovery. Selecting a creation action performs the host's authoritative
case-insensitive recheck and reuses the actual live file without creating a
duplicate. A folder occupying that path fails the action.

A retained creation suggestion checks the current plugin, calendar manager,
active calendar ID, effective format/folder/template, enablement and methods
before native creation starts. A changed route requires fresh suggestions. It
also checks again for a newly existing file and checks the editor action's
permission to start. Lookup and creation each receive their own Moment clone.

Core actions additionally compare the enabled wrapper, instance, raw options,
effective format, native methods, and resolved destination folder identity/path.
A changed default parent invalidates an action even when option strings are
unchanged. Creation calls the captured native Core method with the original
interpreted date. Core owns its host-specific template resolution, template
expansion and actual returned filename; Entities does not copy a template or
unique-name engine.

This is a **pre-start** check. Once native creation begins, Entities cannot
cancel its side effects or freeze its configuration across template awaits.
The native engine may observe a later configuration change. Entities preserves
the actual confirmed file result, never guesses success or deletes partial
files, and applies the existing final editor insertion checks.
