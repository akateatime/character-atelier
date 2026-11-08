# Character Atelier

A free-to-host original-character archive for GitHub Pages. An original,
art-community-inspired layout, not a copy of Elf Art World. No dependencies,
build step, analytics, or external font services. Optionally connect your own
Supabase project for owner login, online editing, image uploads, and publication.

**免寫程式更新：請先閱讀 [繁體中文設定指南](SETUP-zh-Hant.md)。**
One-time cloud/account setup is required; the included files do not provision
a live Supabase project. The management interface is Traditional-Chinese-first;
the public reader supports all four languages.

## Features

- Manga pages can be uploaded together in the cloud-connected studio and
  reordered by dragging or with the up/down buttons. Uploads are public
  immediately; if an upload fails, earlier successful pages remain in the draft.
- Character profiles accept an optional HTTPS YouTube video link, displayed
  inline using YouTube's privacy-enhanced embed. Loading or playing it contacts YouTube.
- Character gallery, stories (including manga), and commission tabs show at most six linked
  works per page, with shareable pagination links.
- Project details show compact participant portraits alongside stories; project
  stories and galleries each display at most six items per page. TRPG details
  show portraits alongside external records and also paginate their gallery.
- Gallery, stories and commissions support selecting multiple characters; works
  linked to any selected character match. Select none to show all works.
- Creative exchanges store an ordered, editable series of replies and can be
  linked to multiple characters. Import pasted text or a UTF-8 `.txt` file,
  using a line containing only `---` between replies; this preserves line
  breaks within a reply. Import appends replies to the active content language;
  fill or translate the other languages before publication.
- Project and TRPG entries can be duplicated as templates, including their
  translated fields and record links, without copying character or work links.
- When uploading a character portrait, choose a square crop by dragging or
  using sliders, or keep the original image. Cropping produces a static PNG.
- TRPG pages show external HTTPS record links. Existing linked stories remain
  in the archive and story pages, but are no longer listed on TRPG detail pages.
- Responsive character directory with text search and world filters.
- Character portraits, profile details, tags, and biography sections.
- Artwork galleries with credits and accessible enlarged-image dialogs.
- Story chapters with previous/next navigation.
- Shareable hash URLs that work on GitHub Pages, including project sites.
- Original SVG demo illustrations and original sample stories to replace.
- Content validation with a visible error state for invalid data.
- Four languages: Traditional Chinese, English, Japanese, and Korean, including
  the sample profiles, artwork descriptions, and every story chapter.
- A storybook-inspired interface with framed illustrations, paper-like cards,
  soft botanical gradients, and reduced-motion support.
- An interactive relationship atlas and a focused map on every character page.
- Character-linked chapters and galleries, plus Creative Project and TRPG scenario
  participation sections (blank until entries are added).
- Light/dark appearance and Traditional Chinese as the default reader language.
- Optional owner studio: form-based editing, automatic relationship diagrams,
  raster image uploads, browser drafts, JSON backups, and revision-checked publishing.

## Publish on GitHub for free

1. Create a **public** GitHub repository with a `main` branch. Public is the
   straightforward free GitHub Pages option.
2. Put the **contents of this folder** at the repository root, not the enclosing
   `character-atelier` folder. Include `.github/workflows/deploy.yml` and
   `.nojekyll`. If using GitHub's web upload, confirm the hidden workflow file
   was actually included, or create it using **Add file > Create new file**.
3. Open repository **Settings > Pages > Build and deployment**, and select
   **GitHub Actions** as the source.
4. Open **Actions > Deploy character archive to GitHub Pages > Run workflow**.
   Future pushes to `main` deploy automatically. If your default branch is not
   `main`, change the workflow's branch filter.
5. After the deployment succeeds, open the URL shown in **Settings > Pages**.
   Usually it is `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`.

GitHub Pages is static hosting, not a running backend service. The included
[`cloud-config.json`](cloud-config.json) enables a local-only debug studio on
`localhost` for previewing and editing browser-local drafts without signing in.
Do not deploy it with `debugMode` enabled: anyone visiting a deployed debug
studio can edit their own local copy. To enable the authenticated online owner
studio, follow the [setup guide](SETUP-zh-Hant.md) and use a config with
`debugMode` disabled.
Supabase supplies authentication, a shared public document, and image storage.
Only allowlisted owners can publish; this is not a public multi-user platform.
All published content, uploaded images, and files in a public repository are
public. Drafts are local to the browser, not private cloud documents.
Never upload secrets or private character notes.

GitHub service limits and terms can change. Check
[GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
before storing a large archive. Optimize images and avoid large video files.

## Preview locally

With Python 3 installed, run from this folder:

```shell
python -m http.server 8000
```

Open `http://localhost:8000`. Stop with Ctrl+C. Opening `index.html` directly
does not work because browsers restrict fetching the content JSON from file URLs.

## Edit from the website (recommended)

After the [one-time setup](SETUP-zh-Hant.md), open **管理網站** in the footer.
Sign in, choose a character or section, fill in forms, and upload images.
The studio has separate sections for characters, gallery, stories, manga,
commissions, creative projects, and TRPG scenarios. Select a character in each
content section, then expand an item to edit it. A story can be changed to
manga (or vice versa) using its reading format, subject to the existing
content-preservation checks; it then appears in the corresponding section.
Add/reorder/delete biographies, artworks, chapters, Creative Projects, TRPG scenarios,
and relationships without editing code. IDs and structural changes synchronize
across languages automatically. Gallery works, prose or illustrated chapters,
manga, and commissions can each be linked to multiple characters from one
shared entry; they appear once in site-wide collections and on every linked
character's page. The studio can fill blank translations from
the current language without overwriting existing translations; it does not
machine-translate text.

Edits auto-save as local browser drafts. **發布網站 / Publish** validates and
atomically publishes all languages; readers see updates on reload without
another GitHub deployment. Uploads are public immediately, even before publishing.
Images are limited to 5 MiB each; the multilingual document is limited to 4 MB.
Deletion of an entry does not delete its stored image. JSON backups contain
image URLs, not image binaries. Download backups and keep original images.

Publication conflicts preserve your draft: download it, load the latest version,
and reapply your changes. Free-tier quotas and idle-project pausing apply.
Configured cloud errors are shown explicitly rather than silently reverting
to outdated bundled samples.

## Edit repository files (static mode / advanced)

With cloud mode disabled, content lives in [`data/content.json`](data/content.json). Edit it with a
text editor or GitHub's file editor. Preserve valid JSON: double quotes,
no comments, and no trailing commas.

- `site`: homepage title, description, hero illustration, and welcome note.
- `characters`: duplicate an existing character object to add another.
- `id`: unique lowercase letters/numbers separated by hyphens, such as
  `mira-everfern`. Keep IDs stable so shared links continue working.
- `name`, `world`, `summary`, `tags`: directory and profile information.
- `portrait`, `portraitAlt`: local image path and meaningful alternative text.
- `facts`: text key/value pairs. You can add fields such as species, height,
  birthday, designer, or affiliation.
- `about`: a list of `{ "title": "...", "text": "..." }` biography sections.
  Use `\n\n` inside a string for paragraph spacing.
- `gallery`: artwork entries with a unique per-character `id`, `characterIds`
  (one or more linked character IDs), `title`, `src`, `alt`, `credit`, and `date`.
- `chapters`: entries with a unique per-character `id`, `title`, `date`,
  `credit`, `characterIds` (one or more linked character IDs), and a
  `paragraphs` array of plain-text strings. `format` supports prose,
  illustrated passages, and manga. Array order controls reading order, not the
  date.
- `commissions`: entries with a unique per-character `id` and `characterIds`
  for all linked characters.

The editor upgrades older content automatically: existing artwork, chapters,
and commissions initially link only to the character that already contains
them. Keep each shared entry in one character's array; `characterIds` controls
which other character pages also show it.

Gallery and chapter arrays can be empty. The homepage features the first three
characters and chapters from the first two characters, in data order.
Search covers names, worlds, summaries, tags, and biography text.

Add your own images under [`assets/`](assets/). Paths are relative to the site
root, for example `assets/mira-portrait.webp`, **without a leading slash**.
Use letters, numbers, hyphens, underscores, and folders in image filenames;
do not use spaces. Supported extensions: SVG, PNG, JPG, JPEG, WebP, GIF, AVIF.
Path casing must match exactly on GitHub, even if Windows accepts a mismatch.
Use optimized WebP/JPEG files for large galleries and upload only images you
have permission to publish. Do not upload untrusted SVG files; prefer raster
images for artwork from untrusted sources.

Text is rendered as plain text, not Markdown or HTML. Broken image URLs should
be fixed by checking the uploaded filename and its capitalization. Invalid
content structure stops loading and displays an error; the browser console
contains the specific validation message.

## Customize the design

Edit [`styles.css`](styles.css) for colors, spacing, and typography. The
`:root` variables define the palette. Edit [`index.html`](index.html) and the
brand/page-title text in [`app.js`](app.js) to rename the site globally.
The homepage heading is controlled separately by `site.title`.

## Languages

The header language menu switches between 繁體中文 / English / 日本語 / 한국어
without changing the current character or chapter URL. The choice is saved in
this browser's local storage. **Traditional Chinese is the default for all new
visitors**, regardless of browser language. Previously saved language choices
are respected. The initial HTML, loading screen, and navigation also start in
Traditional Chinese. If browser storage is blocked, switching still works
but the preference cannot be saved (a warning is logged).

In static mode, English remains in [`data/content.json`](data/content.json). The other languages
are in [`data/zh-Hant.json`](data/zh-Hant.json),
[`data/ja.json`](data/ja.json), and [`data/ko.json`](data/ko.json).
All language packs are loaded and validated before the site opens; a missing
or invalid pack produces a visible error instead of a partly translated page.

Each language pack contains:

- `ui`: interface messages, keyed by their English source text. Preserve
  placeholders such as `{count}`, `{number}`, `{title}`, and `{credit}`.
- `site`: translated homepage text, including image alternative text.
- `characters`: translated text keyed by the **same character IDs** as English.
  Include name, world, summary, portraitAlt, tags, facts, about, gallery, chapters.
- `about` and `gallery`: translated arrays in the **same order and length** as
  the English arrays.
- `chapters`: translations keyed by the **same chapter IDs**, each with title,
  credit, and paragraphs. Chapter reading order comes from the English file.

Images, IDs, and dates are shared from the English content so translations do
not duplicate assets or break existing links. Add new characters, gallery
entries, biography sections, and chapters to **all four languages** together.
All prose and alternative text should be translated; names and credits can
remain in their original spelling if that is the creator's preference.
Search and world filters use the currently selected language's content.
The Character Atelier brand name intentionally stays the same in all languages.

## Light and dark appearance

Use the header's **深色模式 / Dark mode / ダークモード / 다크 모드** toggle to
switch between the light botanical palette and a dark forest palette.
The button's pressed state indicates dark mode. Theme and language choices are
independent and both persist in this browser. New visitors start in light mode.

[`theme.js`](theme.js) restores the saved theme before the stylesheet loads to
avoid flashing a light background on dark-mode visits. It also updates the
browser's theme color. If local storage is unavailable, the switch still works
for the current page; a warning explains that the preference cannot be saved.
Keep this script in the website root when uploading to GitHub Pages.

All interface surfaces, form controls, dialogs, reading pages, and error states
support both palettes. Artwork keeps its original colors in either mode.
Edit the `:root` and `:root[data-theme="dark"]` variables in
[`styles.css`](styles.css) to customize the two palettes.

## Example direct links

- `#/characters`
- `#/relationships`
- `#/character/mira/about`
- `#/character/mira/gallery`
- `#/character/mira/stories`
- `#/story/mira/the-first-seed`

Append these to your published site URL. Hash routing avoids server rewrite
rules and GitHub Pages deep-link 404 errors.

## Importing a Plurk conversation

The static site does not fetch Plurk posts or authenticate to Plurk. To import
a saved Plurk page, open the studio's **交流創作** section, select a character,
and expand **從 Plurk 儲存網頁建立交流創作**. Supply the saved HTML file, its
resource folder, a title, date, and linked characters (use Chrome or Edge for
the folder picker). The importer takes reply
text and saved pictures, omits author names and link URLs, and copies the same
Traditional Chinese content into all four languages (it does not translate).
Missing resources stop the import; for Plurk images whose full-size file is
absent, the saved `_tn.jpg` thumbnail is used when available. Check the result
and edit it as needed. Only import content you have permission to publish.

On confirmation, cloud mode uploads images to the public Supabase bucket and
publishes the **entire draft**, including unrelated pending changes. Images
already uploaded remain public even if a later upload or publication fails.
The progress bar shows image validation and upload counts separately; reading,
local storage, and publishing show an indeterminate indicator. Wait for the
completion message before leaving or starting another import.
Local debug mode applies the draft to the current browser's preview instead;
its imported images live in browser storage, are not included in JSON backups,
and cannot be published from a backup. Reimport the original HTML and folder
in cloud mode to publish. Clearing browser data deletes local preview images.

For manual text import, open the
conversation in Plurk using an account authorized to see it, copy the replies
you have permission to publish, and paste them into the studio's **交流創作**
section. Separate each reply with a line containing only `---`, then select
**匯入回覆**. A local UTF-8 text file in the same format can also be loaded.
Check the imported text and ordering; add, edit, delete, or reorder individual
replies as needed. Neither import retains Plurk reply IDs or automatically
attribute speakers. Only import and publish material with permission from its
creators; publication makes the content public.

Replies can include `[Sticker: filename.png]` for an inline sticker and
`[Image: assets/exchange-media/filename.png]` for a larger picture. Put these
files in `assets/exchange-media` and deploy that directory with the site.
Alternatively, an Image or Sticker marker may contain a public image URL from the
configured Supabase image bucket. Supported local formats are PNG, GIF, JPEG,
and WebP; filenames may contain letters, numbers, underscores, and hyphens.
Missing or unsupported images remain visible as their original markers. Reply
text and markers remain editable in the studio; author labels are not added
automatically. Only deploy media you have permission to display.

Plurk's [API documentation](https://www.plurk.com/API) describes OAuth 1.0a
signed requests. Direct URL import would require a separately configured Plurk
app and secure server-side authorization; no Plurk credentials are stored in
this site.

## Relationships

The **關係圖 / Relationships** page displays all characters. Each profile also
shows a focused map containing that character and their direct connections.
Portraits link to profiles; relationship cards show only the portrait and name.

Hover a connecting line or its star, or focus it with Tab, to reveal a short
relationship introduction. Click, tap, Enter, or Space pins the introduction;
activate it again, click the map background, or press Escape to dismiss.
Descriptions can also be hovered without disappearing. Large maps keep readable
portrait cards and scroll within the map on smaller screens. The map itself is
keyboard-focusable for scrolling. Characters without connections still appear;
an archive without recorded relationships displays an explicit empty state.

In the English content file, add a top-level `relationships` array:

```json
{
  "relationships": [
    {
      "id": "mira-rowan",
      "from": "mira",
      "to": "rowan",
      "label": "Letters without words",
      "description": "A quiet friendship, sustained by weekly deliveries."
    }
  ]
}
```

`from` and `to` must be distinct, existing character IDs. Each relationship ID
must be unique. Relationships are **undirected**: use one entry per pair, and
describe any different feelings or roles in the description rather than adding
a second, reverse entry. Use `[]` for no relationships.

In each translation pack, use the same relationship ID:

```json
{
  "relationships": {
    "mira-rowan": {
      "label": "無字的信",
      "description": "每週的送信時光，串起兩人安靜的友誼。"
    }
  }
}
```

Use `{}` in the translation packs if the English relationships array is empty.
The supplied example relationship is fictional, like the supplied characters.

## Creative Project and TRPG participation

On each profile's About page, **創作企劃 / Creative Projects** and
**參與的 TRPG 劇本 / TRPG Scenarios** show participation records.
The sample characters have not joined any; both sections intentionally contain
blank space, not invented participation. Add these arrays to each character in
the English content file (empty arrays are valid):

```json
{
  "artProjects": [
    {
      "id": "garden-sketchbook",
      "title": "The Garden Sketchbook",
      "description": "A collaborative illustration project. Mira joined as a resident botanist.",
      "url": "https://example.com/garden-sketchbook"
    }
  ],
  "trpgScenarios": []
}
```

`id`, `title`, and `description` are required for an entry. `url` is optional;
if provided, it must be an absolute HTTPS URL without embedded credentials.
Links open in a new tab. Do not include an empty URL string; omit the property
when no project page exists. Each array needs unique entry IDs.

Translate each entry by ID in every language pack; URLs and order are shared
from the English record:

```json
{
  "artProjects": {
    "garden-sketchbook": {
      "title": "花園速寫簿",
      "description": "共同創作的插畫企劃。米拉以常駐植物學家的身分參與。"
    }
  },
  "trpgScenarios": {}
}
```

Use `{}` for a participation category with no entries. All relationships and
participation records are validated across languages when the site loads;
unknown character references, duplicate pairs, invalid links, or missing
translations produce a visible error instead of broken navigation.

## Commissioned artwork and writing

The **Commissions** directory (`#/commissions`) shows 10 works per page. Each
character also has a Commissions tab, and each work has a permanent detail URL
`#/commission/<character-id>/<commission-id>`. These works stay separate from
the owner's gallery and story chapters.

In the owner studio, select a character and find **委託作品 / Commissions**.
Add a title, date, and an image, written passage, or both. Images use the same
upload restrictions as the gallery and require alternative text. Artist name
and HTTPS social-media URL are independently optional; a name links to the
supplied social profile, or displays as plain text without a URL. Links open
safely in a new tab, using a generic label when no artist name is supplied.
Only publish works you have permission to display.

Each character's optional `commissions` array defaults to `[]` for older
archives. Entries contain `id`, `title`, `date`, `src`, `alt`, `text`,
`artistName`, and `artistUrl` (use empty strings for optional fields).
Titles, image descriptions and passages are localized; IDs, image URLs,
dates and artist identity/links are shared across languages. Add/delete/reorder,
local drafts, backups, translation filling and publication use the existing
editor workflow. No database or SQL migration is required.
For repository-managed content, add translated `title`, `alt` and `text` under
each character's `commissions[commission-id]` in the language packs, following
the chapter translation pattern. Empty commission lists need no pack entries.

## Paginated artwork and story directories

The global Stories and Gallery directories show 10 works per page with
Previous/Next links, visible ranges and page counts. Page URLs such as
`#/stories/page/2` and `#/gallery/page/2` can be bookmarked;
browser Back/Forward and language switching preserve the page. Out-of-range
pages move to the last available page. Stories include manga and illustrated
chapters; old manga directory links redirect to the first story page. Character
tabs and project story/gallery lists show up to six items per page; chapter
readers remain unpaginated. These directories use a lightweight exhibition-catalogue design
with story cover thumbnails and framed gallery works, without animation loops.

## Relationship map zoom

Both global and profile relationship maps have Zoom in/out, Fit map, and Reset
zoom controls (10%–200%). Fit map fits within that range; exceptionally large
maps can still be scrolled. Scroll inside the bounded map to explore both axes.
Focus the map viewport to use `+` / `-` and `0` (original size).
Use the mouse wheel over the map to zoom toward the pointer. Hold the left mouse
button on empty space and drag to pan within its scrollable bounds; when the map
fits, there is nothing to pan. Links, relationship lines and tooltip text keep
their normal interactions. Wheel over a tooltip scrolls its text.
Ctrl/Command + wheel retains browser zoom, and native touch scrolling remains
available. Decorative orbital lines are static SVG, and zoom transforms the
existing map rather than rebuilding portraits/edges. No animation loop, physics
engine, particles, animated blur, or extra dependency is used.

## Shared projects, illustrated stories, and manga

The studio's **創作企劃 / TRPG 管理** section is the shared project catalogue.
Visitors browse separate **Creative Projects** (`#/projects`) and **TRPG**
(`#/trpg`) pages from the main navigation. Each list shows only its own type,
including its own empty state; detail-page breadcrumbs return to that list.
Existing `#/project/<id>` links, participation and associated works are unchanged.
Create each project once, then select participation on each character's form.
Select related projects on artwork and chapter forms independently; a work can
belong to multiple projects. Project pages (`#/project/ID`) display all explicitly
participating characters and all explicitly linked artworks and chapters,
including illustrated stories and manga. Images inside linked illustrated/manga
chapters also appear in the project gallery; their image dialogs link back to the
chapter. Other works are not included just because their character participates.
Story and gallery pagination are independent and both page numbers are retained
in the project URL. The TRPG gallery is paginated too.
Both works and profiles link
back to the project. Removing participation does not remove a work's project link.
Deleting a shared project removes its participation/references in every language,
but does not delete characters, works, chapters, or uploaded files.

The **閱讀格式** selector offers text, illustrated, and manga chapters:

- Text retains the existing paragraph editor.
- Illustrated chapters have ordered text/image blocks. Add text with
  **新增文字區塊**, and images with the block list's **新增** button.
- Manga chapters contain ordered image pages in a continuous vertical reader.
  Add/upload pages individually; arrows reorder and Delete removes a page.
  Alt text is required; captions are optional. The global and character story
  pages list manga chapters; the studio retains its separate manga editing section.
- Each image block uses the existing 5 MiB raster upload control. Images and
  block order synchronize across languages; prose, alt text and captions are
  translated individually. Fill blank translations before publishing.
- Switching text to illustrated preserves paragraphs in a text block. Switching
  back refuses to discard images. Manga conversion refuses to discard text:
  use illustrated format for mixed content, or explicitly remove text first.

Existing schema-version-1 documents and backups upgrade on load without changing
character/chapter IDs or prose. Legacy participation IDs become shared projects;
matching IDs share a project, not merely matching names. If older entries used
different IDs for the same project, choose one shared project, move participation
and work links to it, then delete the duplicate from the studio.
No new Supabase SQL setup is necessary for this document-format extension.

For static-file editing, each content locale now supports:

```json
{
  "projects": [
    { "id": "star-sea", "kind": "creative", "title": "Star Sea", "description": "A shared creation project." }
  ]
}
```

`kind` is `creative` or `trpg`; `url` is optional HTTPS. Participation records
reference this ID in `artProjects` or `trpgScenarios`, with a per-character
participation `description`. Legacy `title` fields are preserved, but displayed
titles and URLs come from the shared catalogue. Gallery entries and chapters have
`projectIds: ["star-sea"]` (or `[]`). Chapters default to `format: "prose"` and
`blocks: []` for backwards compatibility. Illustrated and manga chapters use
empty `paragraphs: []` and ordered blocks, for example:

```json
{
  "format": "illustrated",
  "paragraphs": [],
  "projectIds": ["star-sea"],
  "blocks": [
    { "type": "text", "text": "The journey begins." },
    { "type": "image", "src": "assets/mira.svg", "alt": "Mira at the gate.", "caption": "" }
  ]
}
```

Manga uses `format: "manga"` with image blocks only. Required chapter ID, title,
credit and date fields remain unchanged. In static translation packs,
`projects` maps project IDs to translated `title`/`description`; chapter `blocks`
is an array aligned to the English blocks, containing translated `text`, or
`alt`/`caption`. Image paths, types, project references and order stay shared.
