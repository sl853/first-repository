# Understudy Go-Live Tonight

This is the shortest practical path to replace the current Deal Hunter site with Understudy.

## What is ready

- the homepage has been reframed around Understudy as the umbrella company
- the detailed business structure is documented privately in `docs/understudy-business-architecture.md`
- the app already has a `render.yaml`, health check, and production start command

## What still needs a live-hosting decision

We still need to know where the current Deal Hunter site is hosted and where the domain is managed.

Most likely cases:

- Render + custom domain
- Vercel + custom domain
- Netlify + custom domain
- Cloudflare DNS pointing to some other host

## Fastest swap pattern

1. Deploy this Understudy app as a new web service.
2. Confirm the temporary service URL works.
3. Move the custom domain from Deal Hunter to the new Understudy service.
4. Verify the root domain and `www` both resolve correctly.
5. After the new site is serving, shut down the old Deal Hunter service.

## If the current site is on Render

1. Create a new Render web service from this codebase.
2. Let Render detect `render.yaml`.
3. Build command:

   `npm install && npm run build`

4. Start command:

   `npm start`

5. Once the service is healthy, add the custom domain to the Understudy service.
6. Remove the domain from the Deal Hunter service.
7. Update DNS if Render asks for new records.
8. After DNS is verified, disable or delete the Deal Hunter service.

## If the current site is on Vercel or Netlify

1. Create a new project from this codebase.
2. Use Node runtime defaults.
3. Confirm the preview deployment loads.
4. Move the existing domain from Deal Hunter to the Understudy project.
5. Remove the domain from the old project.
6. Disable the old project once traffic is landing on Understudy.

## Recommended public posture tonight

- Keep the site simple.
- Do not publish the full internal architecture.
- Show Understudy as the parent company with a few current lines of work.
- Keep Deal Hunter framed as a transition under the umbrella unless you want it named directly.

## Final checks before switch

- Homepage loads
- `/health` returns healthy
- latest scout brief renders
- mobile layout is acceptable
- custom domain resolves to Understudy
- old Deal Hunter service is no longer serving the old homepage
