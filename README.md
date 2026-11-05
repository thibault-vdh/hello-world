# Noon Security homepage rebuild

A static rebuild of the [noon.security](https://noon.security) homepage (originally built in Webflow), made so we can try out tweaks. It uses plain HTML, CSS and JS, has no build step and no dependencies, and every asset is stored in the repo.

## Run it

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

Any static server works. You can also open `index.html` directly, but the Vimeo embeds behave better over http.

## Structure

```
index.html        All page markup. Sections are marked with big comment banners.
css/styles.css    Design tokens (:root), then one block per section, then responsive rules.
js/main.js        Nav dropdown, mobile menu, tabs, sticky section menu, FAQ, video/lightbox, forms.
assets/
  fonts/          New Grotesk (body), Merriweather (display serif), Geist Mono (eyebrows)
  img/            Product visuals and backgrounds (AVIF, pulled from the live site)
  logos/          Customer logos for the marquee, plus the Latio logo
  icons/          Microsoft 365 / Outlook icon (all other icons are inline SVG in index.html)
  video/          Looping intro snippet used behind the product video
```

## Making tweaks

- **Colours, fonts, radii, spacing:** edit the tokens at the top of `css/styles.css` (`--orange`, `--ink`, `--radius-md`, …).
- **Type scale:** `1rem` is 15px at a 1440px viewport, scaling fluidly between 14px and 16px (`html { font-size: clamp(...) }`), the same as the Webflow original. Heading sizes are the `.h1`, `.h2` and `.h3` classes.
- **Copy:** edit it directly in `index.html`.
- **Customer logos:** edit the two `.marquee__group` blocks (one in the logo strip under the hero, one in the bottom CTA). The second group in each is a copy that makes the loop seamless, so keep the two in sync.
- **Breakpoints:** `991px` (tablet: single-column layouts, burger menu) and `767px` (phone).

## Sections

1. Nav: sticky. The Products dropdown has a hover preview, and below 992px it becomes a burger menu.
2. Hero: headline, early-access form, product visual
3. Logo strip: "an aikido company", plus an auto-scrolling customer marquee
4. Product video: a looping snippet; clicking play loads Vimeo `1237624568`
5. Stats band
6. "Protect your team" tabs: hover or click on desktop, accordion-style on mobile
7. "From protection to prevention": a sticky section menu and four explainer cards
8. Integrations: workspaces and channels
9. Latio testimonial
10. Bottom CTA, with a form and the logo strip
11. FAQ accordion
12. Footer
13. A floating "Play Demo" card (desktop only) that opens Vimeo `1237575721` in a lightbox

## Forms

Both early-access forms are wired to the **same HubSpot form as the live site** (portal `26076760`, form `e7928bfb-…`, region `eu1`) through HubSpot's Forms API.

Submissions are **off by default** (`SUBMIT_TO_HUBSPOT: false` in `js/main.js`), so testing locally doesn't create real leads. Set it to `true` before going live.

## Differences from the live site

- The page loads no analytics, tag manager, cookie banner or HubSpot embed script. "Change Cookie Preferences" in the footer is a placeholder.
- Links to other pages (pricing, features, legal, etc.) point to the live noon.security URLs.
- The Vimeo players use Vimeo's standard embed rather than the custom-controls player from the original build.
