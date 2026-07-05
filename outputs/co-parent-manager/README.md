# Parent Manager

A free, local-first co-parenting daily planner inspired by David Seah's Emergent Task Planner and tools like MyFamilyWizard.

## What it does

- Gives you a single daily planning sheet for co-parenting priorities, time blocks, interruptions, and carry-forward notes.
- Saves reminders for exchanges, school, medical items, expenses, and schedule changes.
- Logs childcare support requests when coverage is needed during the other parent's parenting time.
- Tracks school options, application stages, deadlines, and school-choice decisions.
- Monitors homework assignments, due dates, status, and parent follow-up.
- Imports WhatsApp chat ZIP/TXT exports into a private local searchable archive.
- Generates neutral co-parenting message drafts from plain facts.
- Opens WhatsApp with the message text ready to send.
- Stores a co-parent profile locally in your browser.
- Stores agreements and a communication log in browser `localStorage`.
- Exports and imports your data as JSON.

## WhatsApp note

Free personal WhatsApp and WhatsApp Communities do not provide reliable auto-posting for third-party apps. This MVP uses WhatsApp share links so you can send prepared messages manually. A later hosted version could integrate WhatsApp Business Cloud API for supported one-to-one message templates, but Community automation is still limited.

For privacy, do not commit co-parent phone numbers or emails to the public GitHub Pages source. Store those details in Settings inside the app, or keep a local ignored `private-*.json` profile file and import it from your own browser.

## Run locally

From this folder:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/
```
