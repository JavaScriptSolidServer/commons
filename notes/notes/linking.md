# Linking notes

There are three ways to point from one note to another.

1. `[[welcome]]` links to the note called `welcome.md` in the same folder: [[welcome]].
2. `[[welcome|back to the start]]` does the same with your own words: [[welcome|back to the start]].
3. `[text](welcome.md)` is the standard Markdown link, and works everywhere Markdown does.

A dated note can be named without its date: `[[first-entry]]` finds `2026-11-18-first-entry.md` when the
folder can be listed, as on a Solid pod: [[2026-11-18-first-entry]].

Links open in place: the next note is drawn without loading the page again.
