# Custom domain

The app is ready to use with a custom domain on Vercel. Add the domain in the Vercel project settings under **Domains**, then follow Vercel's DNS instructions for the domain registrar.

Recommended DNS setup:

- Apex domain: add the A record Vercel provides.
- `www` subdomain: add the CNAME record Vercel provides.

After DNS verification, set the custom domain as the primary domain. The PWA manifest, service worker, and privacy page use relative paths, so they work on the assigned domain without a code change.
