# Date suggestions

The Date provider requires Natural Language Dates. With a compatible Periodic
Notes calendar-set integration, it uses the active calendar's daily or weekly
format and folder. Existing notes are real file targets with the user's phrase
as their alias, whether **Create non-existent dates** is on or off. With creation
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
week input.

Natural phrases keep their interpreted dates. In particular, “this week” keeps
the selected day for a configured locale-week format; it is not forced to ISO
Monday. On Sunday May 17, 2026, an English locale-week format identifies W21
while the ISO week is W20. Explicit ISO input always starts on ISO Monday, then
uses the configured format for its destination.

Without Periodic Notes, or with a recognized inactive granularity, the provider
keeps its Natural Language Dates daily / ISO weekly unresolved-link fallback.
An unknown or malformed active calendar is unavailable, shown in the provider's
settings status. It does not silently route to another folder or integration.
An unavailable weekly route does not prevent valid daily routes from working.
Core Daily Notes and the older flat Periodic Notes settings API are not supported
destination integrations in this change.

A retained creation suggestion checks the current plugin, calendar manager,
active calendar ID, effective format/folder/template, enablement and methods
before native creation starts. A changed route requires fresh suggestions. It
also checks again for a newly existing file and checks the editor action's
permission to start. Lookup and creation each receive their own Moment clone.

This is a **pre-start** check. Once native creation begins, Entities cannot
cancel its side effects or freeze its configuration across template awaits.
The native engine may observe a later configuration change. Entities preserves
the actual confirmed file result, never guesses success or deletes partial
files, and applies the existing final editor insertion checks.
