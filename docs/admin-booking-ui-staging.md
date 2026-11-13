# Private booking inbox UI preflight

The standalone booking/admin-inbox.html and booking/admin-inbox-ui.js provide a mobile-friendly black/gold administrator view with a manual “Enviar a despacho” button per received reservation.

Safety constraints:
- Page is NOT mounted or published. The administrator must authenticate through the future booking-server admin session. Merely copying this HTML to GitHub Pages would expose an unsafe UI and does not work.
- Private GET /admin/booking/ and POST /admin/booking/:reference/send-to-dispatch endpoints must be mounted on the booking server with admin authentication and a same-site session/CSRF control.
- Button is disabled for transferring, transferred, and cancelled statuses. Network uncertainty leaves it disabled until a fresh review.
- The frontend has no dispatch secret and never calls the dispatch server directly.
- Set a restrictive CSP and no-store on the private server response when wired.
- Verify staging PostgreSQL schema, separate booking database, session handling, secure dedicated service secret and dispatch migration before mounting.
- No production files, Render service settings or PostgreSQL data were modified.
